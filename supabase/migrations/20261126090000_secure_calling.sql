-- Secure calling: in a branch with secure_calling on, tele-counsellors never receive student or parent numbers.
-- Calls and visit invites go through a company provider. The server fetches a number only to hand it to the provider.

alter table public.branches add column secure_calling boolean not null default false;
alter table public.staff_profiles
 add column daily_attempt_target integer not null default 600 check (daily_attempt_target between 1 and 2000),
 add column work_phone text check (work_phone is null or work_phone ~ '^[0-9]{10}$');
alter table public.students
 add column lead_received_on date,
 add column consent_basis text check (consent_basis in ('direct_enquiry','third_party','unknown')),
 add column calling_status text not null default 'eligible' check (calling_status in ('eligible','held','do_not_contact')),
 add column calling_note text check (length(calling_note)<=300);
grant select(lead_received_on,consent_basis,calling_status,calling_note) on public.students to authenticated;
create index students_calling_queue_idx on public.students(branch_id,assigned_to,calling_status);

create function public.branch_secure_calling(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select secure_calling from public.branches where id=target),false)
$$;
revoke execute on function public.branch_secure_calling(uuid) from public,anon;
grant execute on function public.branch_secure_calling(uuid) to authenticated;

-- Callers in a secure branch get no direct row access to students. Their desk is served by caller_desk().
alter policy students_read on public.students using (
 public.can_manage_branch(branch_id) or (public.my_role()='tele_counsellor' and branch_id=public.my_branch() and assigned_to=auth.uid() and not public.branch_secure_calling(branch_id))
);
alter policy students_update on public.students using (
 public.can_manage_branch(branch_id) or (public.my_role()='tele_counsellor' and branch_id=public.my_branch() and assigned_to=auth.uid() and not public.branch_secure_calling(branch_id))
) with check (
 public.can_manage_branch(branch_id) or (public.my_role()='tele_counsellor' and branch_id=public.my_branch() and assigned_to=auth.uid() and not public.branch_secure_calling(branch_id))
);
-- Inserting would reveal whether a number is already registered.
alter policy students_insert on public.students with check (
 public.can_manage_branch(branch_id) or (public.my_role()='tele_counsellor' and branch_id=public.my_branch() and assigned_to=auth.uid() and not public.branch_secure_calling(branch_id))
);

-- Parent lookup would let a caller test numbers against the branch.
create or replace function public.parent_phone_in_branch(phone text, target uuid default null, selected_branch uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor public.staff_profiles; scope uuid; contact text;
begin
 actor=private.current_staff();
 if actor.id is null then raise exception 'Access denied'; end if;
 if actor.role='tele_counsellor' and public.branch_secure_calling(actor.branch_id) then raise exception 'Access denied'; end if;
 scope=case when actor.role='owner' then selected_branch else actor.branch_id end;
 if actor.role<>'owner' and selected_branch is not null and selected_branch<>actor.branch_id then raise exception 'Access denied'; end if;
 if target is not null then
  if not public.can_access_student(target) then raise exception 'Access denied'; end if;
  if scope is null then select branch_id into scope from public.students where id=target; end if;
 end if;
 if scope is null then return false; end if;
 contact=public.normalize_phone(phone);
 return exists(select 1 from public.students s where s.branch_id=scope and s.parent_phone=contact and (target is null or s.id<>target));
end $$;

-- One current lead per caller. Refreshing or a second tab returns the same lead.
create table private.caller_current_lead (
 caller_id uuid primary key references public.staff_profiles(id) on delete cascade,
 student_id uuid not null unique references public.students(id) on delete cascade,
 assigned_at timestamptz not null default clock_timestamp()
);
alter table private.caller_current_lead enable row level security;

create table public.call_attempts (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id) on delete cascade,
 branch_id uuid not null references public.branches(id),
 caller_id uuid not null references public.staff_profiles(id),
 contact text not null check (contact in ('student','parent')),
 provider text not null check (length(provider) between 1 and 40),
 provider_call_id text check (length(provider_call_id)<=200),
 status text not null default 'requested' check (status in ('requested','ringing','answered','busy','no_answer','failed','completed')),
 requested_at timestamptz not null default clock_timestamp(),
 dialled_at timestamptz, answered_at timestamptz, ended_at timestamptz,
 talk_seconds integer check (talk_seconds>=0),
 counted boolean not null default false,
 unique(provider,provider_call_id)
);
create index call_attempts_caller_day_idx on public.call_attempts(caller_id,requested_at desc);
create index call_attempts_branch_day_idx on public.call_attempts(branch_id,requested_at desc);
create index call_attempts_student_idx on public.call_attempts(student_id,requested_at desc);
alter table public.call_attempts enable row level security;
revoke all on public.call_attempts from public,anon,authenticated;
grant select on public.call_attempts to authenticated;
create policy call_attempts_read on public.call_attempts for select to authenticated using (
 public.can_manage_branch(branch_id) or (caller_id=auth.uid() and public.my_role()='tele_counsellor')
);
create trigger audit_call_attempts after insert or update or delete on public.call_attempts for each row execute function private.audit_change();

create table private.call_events (
 provider text not null, event_id text not null, attempt_id uuid references public.call_attempts(id) on delete cascade,
 status text not null, received_at timestamptz not null default clock_timestamp(),
 primary key(provider,event_id)
);
alter table private.call_events enable row level security;

alter table public.call_logs add column attempt_id uuid references public.call_attempts(id) on delete set null;

create table public.invite_messages (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id) on delete cascade,
 branch_id uuid not null references public.branches(id),
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 sent_by uuid not null references public.staff_profiles(id),
 provider text not null,
 provider_message_id text,
 status text not null default 'requested' check (status in ('requested','sent','delivered','failed')),
 created_at timestamptz not null default clock_timestamp()
);
create index invite_messages_appointment_idx on public.invite_messages(appointment_id);
alter table public.invite_messages enable row level security;
revoke all on public.invite_messages from public,anon,authenticated;
grant select on public.invite_messages to authenticated;
create policy invite_messages_read on public.invite_messages for select to authenticated using (
 public.can_manage_branch(branch_id) or (sent_by=auth.uid() and public.my_role()='tele_counsellor')
);
create trigger audit_invite_messages after insert or update or delete on public.invite_messages for each row execute function private.audit_change();

create function private.ist_day_start() returns timestamptz language sql stable set search_path='' as $$
 select (timezone('Asia/Kolkata',now())::date)::timestamp at time zone 'Asia/Kolkata'
$$;

create function private.secure_caller() returns public.staff_profiles language plpgsql stable security definer set search_path='' as $$
declare actor public.staff_profiles;
begin
 actor=private.current_staff();
 if actor.id is null or actor.role<>'tele_counsellor' or not public.branch_secure_calling(actor.branch_id) then raise exception 'Access denied'; end if;
 return actor;
end $$;

-- Order: callbacks that are due, then missed visits to re-invite, then new leads.
create function public.next_lead() returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles; current_id uuid; picked uuid;
begin
 actor=private.secure_caller();
 perform pg_advisory_xact_lock(hashtextextended('caller-lead:'||actor.id::text,0));
 select c.student_id into current_id from private.caller_current_lead c join public.students s on s.id=c.student_id
  where c.caller_id=actor.id and s.assigned_to=actor.id and s.branch_id=actor.branch_id and s.calling_status='eligible'
   and s.pipeline_stage not in ('Dropped','Closed','Admitted');
 if current_id is not null then return current_id; end if;
 delete from private.caller_current_lead where caller_id=actor.id;
 -- A lead reassigned by the Centre Head stops being anyone else's current lead.
 delete from private.caller_current_lead c using public.students x where c.student_id=x.id and x.assigned_to is distinct from c.caller_id;
 select s.id into picked from public.students s
  left join lateral(select a.status from public.appointments a where a.student_id=s.id order by a.created_at desc,a.id desc limit 1) a on true
  left join lateral(select l.id from public.call_logs l where l.student_id=s.id limit 1) l on true
  where s.branch_id=actor.branch_id and s.assigned_to=actor.id and s.calling_status='eligible'
   and s.pipeline_stage not in ('Dropped','Closed','Admitted')
   and not exists(select 1 from private.caller_current_lead c where c.student_id=s.id)
   and coalesce(a.status,'') not in ('scheduled','attended','completed')
   and ((l.id is not null and s.next_call_at<=now()) or (a.status='missed' and s.pipeline_stage='F2F Missed') or (l.id is null and s.pipeline_stage='New Enquiry'))
  order by case when l.id is not null and s.next_call_at<=now() then 0 when a.status='missed' then 1 else 2 end,coalesce(s.next_call_at,s.created_at),s.id
  limit 1 for update of s skip locked;
 if picked is null then return null; end if;
 insert into private.caller_current_lead(caller_id,student_id) values(actor.id,picked);
 return picked;
end $$;

create function private.caller_day(actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'attempts',count(*) filter (where counted),
  'answered',count(*) filter (where answered_at is not null),
  'conversations',count(*) filter (where talk_seconds>=60),
  'short_calls',count(*) filter (where answered_at is not null and talk_seconds<10),
  'visits_booked',(select count(*) from public.appointments a where a.created_by=actor and a.created_at>=private.ist_day_start())
 ) from public.call_attempts where caller_id=actor and requested_at>=private.ist_day_start()
$$;

-- The caller's whole desk, without any phone number.
create function public.caller_desk() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles; lead uuid; s public.students; since timestamptz; result jsonb;
begin
 actor=private.secure_caller();
 lead=public.next_lead();
 result=jsonb_build_object(
  'target',actor.daily_attempt_target,
  'work_phone_set',actor.work_phone is not null,
  'today',private.caller_day(actor.id),
  'callbacks_due',(select count(*) from public.students x where x.branch_id=actor.branch_id and x.assigned_to=actor.id and x.calling_status='eligible' and x.pipeline_stage not in ('Dropped','Closed','Admitted') and x.next_call_at<=now() and exists(select 1 from public.call_logs l where l.student_id=x.id) and x.id is distinct from lead),
  'lead',null);
 if lead is null then return result; end if;
 select * into s from public.students where id=lead;
 select assigned_at into since from private.caller_current_lead where caller_id=actor.id;
 return jsonb_set(result,'{lead}',jsonb_build_object(
  'id',s.id,
  'first_name',split_part(trim(s.full_name),' ',1),
  'pipeline_stage',s.pipeline_stage,
  'target_course',s.target_course,'academic_stream',s.academic_stream,'percentage_or_score',s.percentage_or_score,
  'city',s.city,'state',s.state,'preferred_locations',s.preferred_locations,'budget_range',s.budget_range,
  'lead_source',s.lead_source,'next_call_at',s.next_call_at,
  'has_parent_phone',s.parent_phone is not null,
  'reason',case when s.pipeline_stage='F2F Missed' then 'missed' when exists(select 1 from public.call_logs l where l.student_id=s.id) then 'callback' else 'new' end,
  'latest_appointment',(select jsonb_build_object('id',a.id,'scheduled_at',a.scheduled_at,'status',a.status) from public.appointments a where a.student_id=s.id order by a.created_at desc,a.id desc limit 1),
  'calls',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'outcome',l.outcome,'remarks',l.remarks,'created_at',l.created_at) order by l.created_at desc) from (select * from public.call_logs where student_id=s.id order by created_at desc,id desc limit 5) l),'[]'::jsonb),
  'attempt',(select jsonb_build_object('id',c.id,'contact',c.contact,'status',c.status,'talk_seconds',c.talk_seconds) from public.call_attempts c where c.student_id=s.id and c.caller_id=actor.id and c.requested_at>=since order by c.requested_at desc limit 1)
 ));
end $$;

create function public.begin_call_attempt(target uuid, contact_type text, provider_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles; s public.students; attempt uuid;
begin
 actor=private.secure_caller();
 if contact_type not in ('student','parent') or contact_type is null then raise exception 'Choose who to call'; end if;
 if provider_name is null or length(provider_name) not between 1 and 40 then raise exception 'Calling provider required'; end if;
 if actor.work_phone is null then raise exception 'Ask your Centre Head to add your work phone before calling.'; end if;
 select st.* into s from public.students st join private.caller_current_lead c on c.student_id=st.id and c.caller_id=actor.id where st.id=target for update of st;
 if s.id is null or s.assigned_to<>actor.id or s.branch_id<>actor.branch_id then raise exception 'This student is not your current lead.'; end if;
 if s.calling_status<>'eligible' then raise exception 'This student is not available for calling.'; end if;
 if contact_type='parent' and s.parent_phone is null then raise exception 'No parent number is saved for this student.'; end if;
 if exists(select 1 from public.call_attempts where caller_id=actor.id and status in ('requested','ringing','answered') and requested_at>now()-interval '15 minutes') then
  raise exception 'Finish your current call first.';
 end if;
 insert into public.call_attempts(student_id,branch_id,caller_id,contact,provider) values(s.id,s.branch_id,actor.id,contact_type,provider_name) returning id into attempt;
 return attempt;
end $$;

-- Server only: hands the numbers to the provider for an attempt that was just requested.
create function public.call_contact(attempt uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.call_attempts; s public.students; p public.staff_profiles;
begin
 select * into c from public.call_attempts where id=attempt;
 if c.id is null or c.status<>'requested' or c.provider_call_id is not null or c.requested_at<now()-interval '2 minutes' then raise exception 'Attempt unavailable'; end if;
 select * into s from public.students where id=c.student_id;
 select * into p from public.staff_profiles where id=c.caller_id and is_active;
 if p.id is null or p.work_phone is null or s.calling_status<>'eligible' then raise exception 'Attempt unavailable'; end if;
 return jsonb_build_object('customer',case when c.contact='parent' then s.parent_phone else s.student_phone end,'agent',p.work_phone);
end $$;

create function public.record_call_started(attempt uuid, provider_call text) returns void language plpgsql security definer set search_path='' as $$
begin
 if provider_call is null or length(provider_call) not between 1 and 200 then raise exception 'Provider call id required'; end if;
 update public.call_attempts set provider_call_id=provider_call where id=attempt and provider_call_id is null;
 if not found then raise exception 'Attempt unavailable'; end if;
end $$;

create function public.record_call_failed(attempt uuid) returns void language sql security definer set search_path='' as $$
 update public.call_attempts set status='failed',ended_at=coalesce(ended_at,clock_timestamp()) where id=attempt and status in ('requested','ringing');
$$;

-- Provider webhook events. Each event id is applied once. An attempt counts once the student's number was dialled.
create function public.record_call_event(provider_name text, event_id text, provider_call text, event_status text, event_at timestamptz default null, talk integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.call_attempts; at_time timestamptz=coalesce(event_at,clock_timestamp()); terminal boolean;
begin
 if event_status not in ('dialled','answered','busy','no_answer','failed','completed') or event_status is null then raise exception 'Unknown call status'; end if;
 if event_id is null or length(event_id) not between 1 and 200 then raise exception 'Event id required'; end if;
 select * into c from public.call_attempts where provider=provider_name and provider_call_id=provider_call for update;
 if c.id is null then raise exception 'Unknown call'; end if;
 insert into private.call_events(provider,event_id,attempt_id,status) values(provider_name,event_id,c.id,event_status) on conflict do nothing;
 if not found then return jsonb_build_object('duplicate',true); end if;
 terminal=c.status in ('busy','no_answer','failed','completed');
 update public.call_attempts set
  dialled_at=case when event_status<>'failed' then coalesce(dialled_at,at_time) else dialled_at end,
  counted=counted or event_status<>'failed',
  answered_at=case when event_status in ('answered','completed') and talk is distinct from 0 then coalesce(answered_at,at_time) else answered_at end,
  ended_at=case when event_status in ('busy','no_answer','failed','completed') then coalesce(ended_at,at_time) else ended_at end,
  talk_seconds=case when event_status='completed' and talk is not null then greatest(talk,0) else talk_seconds end,
  status=case
   when terminal then status
   when event_status='dialled' then case when status='requested' then 'ringing' else status end
   when event_status='answered' then 'answered'
   when event_status='completed' then case when status='answered' or coalesce(talk,0)>0 then 'completed' else 'no_answer' end
   else event_status end
 where id=c.id;
 return jsonb_build_object('duplicate',false);
end $$;

-- Caller outcomes. In a secure branch: only the current lead, only after a call attempt, parent number is write-only.
create or replace function public.record_counsellor_action(target uuid,education jsonb,action_type text,request_id uuid default null,visit_at timestamptz default null,callback_at timestamptz default null,call_remarks text default null,reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles; s public.students; logged public.call_logs; meeting public.appointments; secure boolean; since timestamptz; attempt uuid; new_parent text; parent_updated boolean:=false;
begin
 actor=private.current_staff();
 if actor.role is distinct from 'tele_counsellor' then raise exception 'Access denied'; end if;
 secure=public.branch_secure_calling(actor.branch_id);
 select * into s from public.students where id=target for update;
 if s.id is null or s.branch_id<>actor.branch_id or s.assigned_to is distinct from actor.id then raise exception 'Access denied'; end if;
 if action_type not in ('details','invite','callback','no_answer','dropped','wrong_number','do_not_contact') or action_type is null then raise exception 'Choose a valid call outcome'; end if;
 if action_type<>'details' then
  if request_id is null then raise exception 'Request identity required'; end if;
  select * into logged from public.call_logs where id=request_id;
  if logged.id is not null then
   if logged.student_id<>target or logged.logged_by<>actor.id then raise exception 'Access denied'; end if;
   select * into meeting from public.appointments where id=request_id;
   return jsonb_build_object('student_name',case when secure then split_part(trim(s.full_name),' ',1) else s.full_name end,'appointment',case when meeting.id is null then null else to_jsonb(meeting) end,'call',to_jsonb(logged),
    'parent_phone_shared',case when secure then false else public.parent_phone_in_branch(s.parent_phone,s.id,s.branch_id) end);
  end if;
 end if;
 if secure then
  select assigned_at into since from private.caller_current_lead where caller_id=actor.id and student_id=target;
  if since is null then raise exception 'This student is not your current lead.'; end if;
  if action_type<>'details' then
   select id into attempt from public.call_attempts where student_id=target and caller_id=actor.id and requested_at>=since order by requested_at desc limit 1;
   if attempt is null then raise exception 'Call the student before saving an outcome.'; end if;
  end if;
 end if;
 if jsonb_typeof(education) is distinct from 'object' then raise exception 'Invalid details'; end if;
 if (not secure or education ? 'full_name') and length(trim(coalesce(education->>'full_name','')))=0 then raise exception 'Student name is required'; end if;
 if length(coalesce(education->>'full_name',''))>150 or length(coalesce(call_remarks,''))>3000 then raise exception 'Entered text is too long'; end if;
 if action_type='invite' and visit_at is null then raise exception 'Visit date and time required'; end if;
 if action_type in ('callback','no_answer') and callback_at is null then raise exception 'Next callback date and time required'; end if;
 if action_type='dropped' and length(trim(coalesce(reason,'')))=0 then raise exception 'Drop reason required'; end if;
 new_parent=public.normalize_phone(education->>'parent_phone');
 parent_updated=secure and new_parent is not null and new_parent is distinct from s.parent_phone;
 update public.students set
  full_name=case when education ? 'full_name' then trim(education->>'full_name') else full_name end,
  parent_phone=case when secure then coalesce(new_parent,parent_phone) when education ? 'parent_phone' then new_parent else parent_phone end,
  academic_stream=case when education ? 'academic_stream' then education->>'academic_stream' else academic_stream end,
  percentage_or_score=case when education ? 'percentage_or_score' then education->>'percentage_or_score' else percentage_or_score end,
  target_course=case when education ? 'target_course' then education->>'target_course' else target_course end,
  preferred_locations=case when education ? 'preferred_locations' then education->>'preferred_locations' else preferred_locations end,
  budget_range=case when education ? 'budget_range' then education->>'budget_range' else budget_range end,
  city=case when education ? 'city' then education->>'city' else city end,
  state=case when education ? 'state' then education->>'state' else state end
 where id=target returning * into s;
 if action_type='invite' then
  update public.appointments set status='cancelled' where student_id=target and status='scheduled';
  insert into public.appointments(id,student_id,branch_id,scheduled_at,created_by,created_at) values(request_id,target,s.branch_id,visit_at,actor.id,clock_timestamp()) returning * into meeting;
 elsif action_type='dropped' then
  update public.appointments set status='cancelled' where student_id=target and status='scheduled';
  update public.students set pipeline_stage='Dropped',drop_reason=trim(reason),next_call_at=null where id=target;
 elsif action_type in ('callback','no_answer') then
  update public.appointments set status='cancelled' where student_id=target and status='scheduled';
  update public.students set pipeline_stage='Contacted',next_call_at=callback_at where id=target;
 elsif action_type='wrong_number' then
  update public.appointments set status='cancelled' where student_id=target and status='scheduled';
  update public.students set calling_status='held',calling_note='Wrong number reported by caller',next_call_at=null where id=target;
 elsif action_type='do_not_contact' then
  update public.appointments set status='cancelled' where student_id=target and status='scheduled';
  update public.students set calling_status='do_not_contact',calling_note='Asked not to be contacted',next_call_at=null where id=target;
 end if;
 if action_type='details' then
  select * into meeting from public.appointments where student_id=target and status='scheduled' order by created_at desc,id desc limit 1;
 end if;
 if action_type<>'details' then
  insert into public.call_logs(id,student_id,branch_id,logged_by,outcome,remarks,next_callback_at,created_at,attempt_id)
   values(request_id,target,s.branch_id,actor.id,case action_type when 'invite' then 'Agreed to Meet' when 'callback' then 'Call Back Later' when 'no_answer' then 'No Answer' when 'wrong_number' then 'Wrong Number' when 'do_not_contact' then 'Do Not Contact' else 'Not Interested / Dropped' end,
    case when action_type='dropped' then concat_ws(E'\n',nullif(trim(call_remarks),''),'Drop reason: '||trim(reason)) else call_remarks end,
    case when action_type in ('callback','no_answer') then callback_at end,clock_timestamp(),attempt) returning * into logged;
  if secure then delete from private.caller_current_lead where caller_id=actor.id and student_id=target; end if;
 end if;
 return jsonb_build_object('student_name',case when secure then split_part(trim(s.full_name),' ',1) else s.full_name end,'appointment',case when meeting.id is null then null else to_jsonb(meeting) end,'call',case when logged.id is null then null else to_jsonb(logged) end,
  'parent_phone_shared',case when secure then false else public.parent_phone_in_branch(s.parent_phone,s.id,s.branch_id) end,
  'parent_updated',parent_updated);
end $$;

-- Visit invites through the company WhatsApp account.
create function public.begin_invite(appointment uuid, provider_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles; a public.appointments; s public.students; invite uuid;
begin
 actor=private.secure_caller();
 select * into a from public.appointments where id=appointment for update;
 if a.id is null or a.status<>'scheduled' or a.scheduled_at<now() then raise exception 'This visit is no longer scheduled.'; end if;
 select * into s from public.students where id=a.student_id;
 if s.assigned_to is distinct from actor.id or s.branch_id<>actor.branch_id or s.calling_status<>'eligible' then raise exception 'Access denied'; end if;
 if (select count(*) from public.invite_messages where appointment_id=a.id and status<>'failed')>=3 then raise exception 'This invite was already sent.'; end if;
 insert into public.invite_messages(student_id,branch_id,appointment_id,sent_by,provider) values(s.id,s.branch_id,a.id,actor.id,provider_name) returning id into invite;
 return invite;
end $$;

create function public.invite_contact(invite uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.invite_messages; s public.students; a public.appointments; b public.branches;
begin
 select * into m from public.invite_messages where id=invite;
 if m.id is null or m.status<>'requested' or m.created_at<now()-interval '2 minutes' then raise exception 'Invite unavailable'; end if;
 select * into s from public.students where id=m.student_id;
 select * into a from public.appointments where id=m.appointment_id;
 select * into b from public.branches where id=m.branch_id;
 return jsonb_build_object('phone',s.student_phone,'name',split_part(trim(s.full_name),' ',1),'scheduled_at',a.scheduled_at,'branch',b.name,'address',b.address,'maps',b.google_maps_url);
end $$;

create function public.record_invite_result(invite uuid, message_id text, result text) returns void language plpgsql security definer set search_path='' as $$
begin
 if result not in ('sent','delivered','failed') then raise exception 'Unknown invite status'; end if;
 update public.invite_messages set provider_message_id=coalesce(message_id,provider_message_id),status=result where id=invite;
end $$;

-- Centre Head tools.
create function public.caller_activity(selected_branch uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scope uuid;
begin
 scope=case when public.my_role()='owner' then selected_branch else public.my_branch() end;
 if scope is null or not public.can_manage_branch(scope) then raise exception 'Access denied'; end if;
 return jsonb_build_object(
  'secure_calling',public.branch_secure_calling(scope),
  'callers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'is_active',p.is_active,'daily_attempt_target',p.daily_attempt_target,'work_phone',p.work_phone,
    'assigned',(select count(*) from public.students s where s.assigned_to=p.id and s.calling_status='eligible' and s.pipeline_stage not in ('Dropped','Closed','Admitted')),
    'today',private.caller_day(p.id)) order by p.full_name)
   from public.staff_profiles p where p.branch_id=scope and p.role='tele_counsellor'),'[]'::jsonb),
  'held',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'full_name',s.full_name,'calling_status',s.calling_status,'calling_note',s.calling_note,'lead_source',s.lead_source,'consent_basis',s.consent_basis,'lead_received_on',s.lead_received_on) order by s.created_at desc)
   from (select * from public.students where branch_id=scope and calling_status<>'eligible' order by created_at desc limit 200) s),'[]'::jsonb),
  'held_total',(select count(*) from public.students where branch_id=scope and calling_status<>'eligible'));
end $$;

create function public.set_calling_status(ids uuid[], new_status text) returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if new_status not in ('eligible','held','do_not_contact') or new_status is null or ids is null or cardinality(ids) not between 1 and 500 then raise exception 'Invalid request'; end if;
 update public.students set calling_status=new_status,calling_note=case when new_status='eligible' then null else calling_note end
  where id=any(ids) and public.can_manage_branch(branch_id);
 get diagnostics changed=row_count;
 return changed;
end $$;

create function public.set_caller_settings(target uuid, attempt_target integer, phone text) returns void language plpgsql security definer set search_path='' as $$
declare p public.staff_profiles;
begin
 select * into p from public.staff_profiles where id=target for update;
 if p.id is null or p.role<>'tele_counsellor' or not public.can_manage_branch(p.branch_id) then raise exception 'Access denied'; end if;
 if attempt_target is null or attempt_target not between 1 and 2000 then raise exception 'Daily target must be between 1 and 2000.'; end if;
 update public.staff_profiles set daily_attempt_target=attempt_target,work_phone=public.normalize_phone(phone) where id=target;
end $$;

-- Lead import records where each file came from and whether calling consent is clear.
drop function public.bulk_import_leads(uuid,text,jsonb,text,uuid[]);
create function public.bulk_import_leads(target_branch uuid,file_name text,lead_rows jsonb,assignment_mode text,caller_ids uuid[] default '{}',source_name text default null,received_on date default null,consent text default 'unknown') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles;b public.branches;item jsonb;position bigint;row_no int;name text;phone text;parent text;reason text;status text;new_id uuid;assignee uuid;seen text[]='{}';imported int=0;duplicates int=0;invalid int=0;warnings int=0;held int=0;warning boolean;results jsonb='[]';summary jsonb;
begin
 select * into actor from public.staff_profiles where id=auth.uid() and is_active for share;
 if actor.id is null or actor.role not in ('owner','centre_head') or (actor.role='centre_head' and target_branch is distinct from actor.branch_id) then raise exception 'Access denied';end if;
 select * into b from public.branches where id=target_branch and is_active for update;
 if b.id is null then raise exception 'Select an active branch';end if;
 if file_name is null or length(trim(file_name)) not between 1 and 180 or jsonb_typeof(lead_rows) is distinct from 'array' then raise exception 'Invalid import';end if;
 if jsonb_array_length(lead_rows) not between 1 and 5000 then raise exception 'Import 1 to 5000 lead rows at a time';end if;
 if consent is null or consent not in ('direct_enquiry','third_party','unknown') then raise exception 'Choose how these students gave consent';end if;
 if length(source_name)>150 or received_on>timezone('Asia/Kolkata',now())::date then raise exception 'Check the lead source and date received';end if;
 if assignment_mode is null or assignment_mode not in ('round_robin','one','unassigned') or caller_ids is null or array_position(caller_ids,null) is not null or cardinality(caller_ids)<>(select count(distinct v) from unnest(caller_ids) v) or (assignment_mode='one' and cardinality(caller_ids)<>1) or (assignment_mode='round_robin' and cardinality(caller_ids)=0) or (assignment_mode='unassigned' and cardinality(caller_ids)<>0) then raise exception 'Choose a valid assignment option';end if;
 perform 1 from public.staff_profiles where id=any(caller_ids) and branch_id=target_branch and role='tele_counsellor' and is_active order by id for share;
 if (select count(*) from public.staff_profiles where id=any(caller_ids) and branch_id=target_branch and role='tele_counsellor' and is_active)<>cardinality(caller_ids) then raise exception 'Choose active tele-counsellors from this branch';end if;
 for item,position in select value,ordinality from jsonb_array_elements(lead_rows) with ordinality loop
  row_no=case when (item->>'row_number') ~ '^[1-9][0-9]{0,5}$' then (item->>'row_number')::int else position::int+1 end;
  reason=null;status='imported';new_id=null;phone=null;parent=null;name=trim(item->>'full_name');
  begin
   if jsonb_typeof(item)<>'object' or name is null or length(name) not between 1 and 150 then raise exception 'Student Name is required (max 150 characters).';end if;
   if item->>'status'='invalid' then raise exception '%',left(coalesce(item->>'reason','Invalid row.'),500);end if;
   phone=public.normalize_phone(item->>'student_phone');parent=public.normalize_phone(nullif(trim(item->>'parent_phone'),''));
   if phone is null then raise exception 'Enter a valid 10-digit Student Phone.';end if;
   if exists(select 1 from jsonb_each_text(item) f where f.key in ('lead_source','target_course','academic_stream','percentage_or_score','city','state') and length(f.value)>500) then raise exception 'Keep each field to 500 characters or fewer.';end if;
  exception when raise_exception or invalid_parameter_value then reason=sqlerrm;status='invalid';invalid=invalid+1;end;
  if status='imported' then
   if phone=any(seen) then status='duplicate';reason='Duplicate Student Phone within file.';duplicates=duplicates+1;
   else
    seen=array_append(seen,phone);
    assignee=case when assignment_mode='unassigned' then null else caller_ids[1+(imported%cardinality(caller_ids))] end;
    warning=parent is not null and exists(select 1 from public.students where branch_id=target_branch and parent_phone=parent);
    -- An existing phone is skipped, so a Do Not Contact or held status survives re-import.
    insert into public.students(branch_id,assigned_to,full_name,student_phone,parent_phone,lead_source,target_course,academic_stream,percentage_or_score,city,state,pipeline_stage,next_call_at,lead_received_on,consent_basis,calling_status,calling_note)
    values(target_branch,assignee,name,phone,parent,coalesce(nullif(trim(item->>'lead_source'),''),nullif(trim(source_name),'')),nullif(trim(item->>'target_course'),''),nullif(trim(item->>'academic_stream'),''),nullif(trim(item->>'percentage_or_score'),''),nullif(trim(item->>'city'),''),nullif(trim(item->>'state'),''),'New Enquiry',case when assignee is not null then clock_timestamp() else null end,
     received_on,consent,case when consent='unknown' then 'held' else 'eligible' end,case when consent='unknown' then 'Consent unclear at import' end)
    on conflict(student_phone) do nothing returning id into new_id;
    if new_id is null then status='duplicate';reason='Student Phone already registered.';duplicates=duplicates+1;
    else imported=imported+1;if consent='unknown' then held=held+1;end if;reason=case when warning then 'Imported. Parent Phone is shared with another lead in this branch.' else 'Imported.' end;if warning then warnings=warnings+1;end if;end if;
   end if;
  end if;
  results=results||jsonb_build_array(jsonb_build_object('row_number',row_no,'status',status,'reason',reason));
 end loop;
 summary=jsonb_build_object('file_name',file_name,'imported_count',imported,'duplicate_count',duplicates,'invalid_count',invalid,'parent_warning_count',warnings,'held_count',held,'lead_source',nullif(trim(source_name),''),'received_on',received_on,'consent_basis',consent);
 insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details) values(actor.id,actor.role,target_branch,'bulk_lead_import','lead_import',gen_random_uuid(),summary);
 return summary||jsonb_build_object('rows',results);
end$$;

-- Audit rows identify leads by id. Numbers stay out of the log so it cannot become a contact list.
create or replace function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; event_branch uuid; actor public.staff_profiles; private_changed boolean:=false; contacts_changed boolean:=false;
begin
 if tg_op<>'INSERT' then before_row=to_jsonb(old); end if;
 if tg_op<>'DELETE' then after_row=to_jsonb(new); end if;
 if tg_table_name='students' then
  private_changed=(before_row->'counselling_amount',before_row->'college_pdf_path',before_row->'college_pdf_name') is distinct from (after_row->'counselling_amount',after_row->'college_pdf_path',after_row->'college_pdf_name');
  contacts_changed=(before_row->'student_phone',before_row->'parent_phone') is distinct from (after_row->'student_phone',after_row->'parent_phone');
  before_row=before_row-array['counselling_amount','college_pdf_path','college_pdf_name','student_phone','parent_phone'];
  after_row=after_row-array['counselling_amount','college_pdf_path','college_pdf_name','student_phone','parent_phone'];
 elsif tg_table_name='staff_profiles' then
  contacts_changed=(before_row->'work_phone') is distinct from (after_row->'work_phone');
  before_row=before_row-'work_phone';
  after_row=after_row-'work_phone';
 end if;
 row_data=coalesce(after_row,before_row);
 select * into actor from public.staff_profiles where id=auth.uid();
 event_branch=case when tg_table_name='branches' then case when tg_op='DELETE' then null else (row_data->>'id')::uuid end when tg_table_name='branch_transfers' then (row_data->>'to_branch_id')::uuid else (row_data->>'branch_id')::uuid end;
 insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
 values(actor.id,coalesce(actor.role,'system'),event_branch,lower(tg_op),tg_table_name,(row_data->>'id')::uuid,jsonb_build_object('before',before_row,'after',after_row,'private_visit_details_changed',private_changed,'contacts_changed',contacts_changed));
 if tg_op='UPDATE' and before_row->>'branch_id' is distinct from after_row->>'branch_id' and before_row->>'branch_id' is not null then
  insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
  values(actor.id,coalesce(actor.role,'system'),(before_row->>'branch_id')::uuid,'update',tg_table_name,(row_data->>'id')::uuid,jsonb_build_object('before',before_row,'after',after_row,'private_visit_details_changed',private_changed,'contacts_changed',contacts_changed));
 end if;
 return coalesce(new,old);
end $$;

-- One-time redaction of numbers already stored in the audit log. Who, what and when are kept.
update public.audit_logs set details=details
 ||case when jsonb_typeof(details->'before')='object' then jsonb_build_object('before',(details->'before')-array['student_phone','parent_phone']) else '{}'::jsonb end
 ||case when jsonb_typeof(details->'after')='object' then jsonb_build_object('after',(details->'after')-array['student_phone','parent_phone']) else '{}'::jsonb end
 ||jsonb_build_object('contacts_redacted',true)
where entity_type='students' and (coalesce(details->'before' ?| array['student_phone','parent_phone'],false) or coalesce(details->'after' ?| array['student_phone','parent_phone'],false));

revoke execute on function private.ist_day_start(),private.secure_caller(),private.caller_day(uuid) from public,anon,authenticated;
revoke execute on function public.next_lead(),public.caller_desk(),public.begin_call_attempt(uuid,text,text),public.call_contact(uuid),public.record_call_started(uuid,text),public.record_call_failed(uuid),
 public.record_call_event(text,text,text,text,timestamptz,integer),public.begin_invite(uuid,text),public.invite_contact(uuid),public.record_invite_result(uuid,text,text),
 public.caller_activity(uuid),public.set_calling_status(uuid[],text),public.set_caller_settings(uuid,integer,text),
 public.bulk_import_leads(uuid,text,jsonb,text,uuid[],text,date,text) from public,anon,authenticated;
grant execute on function public.next_lead(),public.caller_desk(),public.begin_call_attempt(uuid,text,text),public.begin_invite(uuid,text),
 public.caller_activity(uuid),public.set_calling_status(uuid[],text),public.set_caller_settings(uuid,integer,text),
 public.bulk_import_leads(uuid,text,jsonb,text,uuid[],text,date,text) to authenticated;
-- Only the server (service role) can read numbers for the provider or record provider results.
grant select on public.call_attempts,public.invite_messages to service_role;
grant execute on function public.call_contact(uuid),public.record_call_started(uuid,text),public.record_call_failed(uuid),public.record_call_event(text,text,text,text,timestamptz,integer),
 public.invite_contact(uuid),public.record_invite_result(uuid,text,text) to service_role;
