alter table public.students add column next_call_at timestamptz;
create index students_caller_queue_idx on public.students(branch_id,assigned_to,next_call_at);
create index call_logs_student_created_idx on public.call_logs(student_id,created_at desc,id desc);
create index appointments_student_created_idx on public.appointments(student_id,created_at desc,id desc);
alter table public.call_logs alter column created_at set default clock_timestamp();
alter table public.appointments alter column created_at set default clock_timestamp();

create or replace function private.validate_student_contacts() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.student_phone=public.normalize_phone(new.student_phone);
 new.parent_phone=public.normalize_phone(new.parent_phone);
 if new.assigned_to is not null then
  perform 1 from public.staff_profiles p where p.id=new.assigned_to and p.branch_id=new.branch_id and p.role='tele_counsellor'
   and (p.is_active or (tg_op='UPDATE' and new.assigned_to is not distinct from old.assigned_to and new.branch_id=old.branch_id)) for share;
  if not found then raise exception 'Assignee must be a tele-counsellor in this branch'; end if;
 end if;
 -- The existing unique constraint protects student_phone. Parent contacts may be shared.
 return new;
end $$;
alter policy students_insert on public.students with check (
 public.can_manage_branch(branch_id) or (public.my_role()='tele_counsellor' and branch_id=public.my_branch() and assigned_to=auth.uid())
);
-- Split operation policies so callers cannot delete histories or forge authorship.
drop policy calls_staff on public.call_logs;
create policy calls_read on public.call_logs for select to authenticated using(public.can_access_student(student_id) and (public.my_role()='owner' or branch_id=public.my_branch()));
create policy calls_insert on public.call_logs for insert to authenticated with check(public.can_access_student(student_id) and (public.my_role()='owner' or branch_id=public.my_branch()) and logged_by=auth.uid());
create policy calls_update on public.call_logs for update to authenticated using(public.can_access_student(student_id) and (public.my_role()='owner' or branch_id=public.my_branch())) with check(public.can_access_student(student_id) and (public.my_role()='owner' or branch_id=public.my_branch()));
create policy calls_delete on public.call_logs for delete to authenticated using(public.can_manage_branch(branch_id) and public.can_access_student(student_id));
drop policy appointments_staff on public.appointments;
create policy appointments_read on public.appointments for select to authenticated using(public.can_access_student(student_id) and (public.my_role()='owner' or branch_id=public.my_branch()));
create policy appointments_insert on public.appointments for insert to authenticated with check(public.can_access_student(student_id) and (public.my_role()='owner' or branch_id=public.my_branch()) and created_by=auth.uid() and (public.my_role()<>'tele_counsellor' or status='scheduled'));
create policy appointments_update on public.appointments for update to authenticated using(public.can_access_student(student_id) and (public.my_role()='owner' or branch_id=public.my_branch())) with check(public.can_access_student(student_id) and (public.my_role()='owner' or branch_id=public.my_branch()));
create policy appointments_delete on public.appointments for delete to authenticated using(public.can_manage_branch(branch_id) and public.can_access_student(student_id));

create function private.guard_activity_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' then
  if new.id<>old.id or new.student_id<>old.student_id or new.branch_id<>old.branch_id then raise exception 'Activity identity is immutable'; end if;
  if tg_table_name='call_logs' then
   if new.logged_by<>old.logged_by then raise exception 'Call author is immutable'; end if;
  elsif tg_table_name='appointments' then
   if new.created_by<>old.created_by then raise exception 'Appointment author is immutable'; end if;
   if public.my_role()='tele_counsellor' and (old.status in ('attended','completed','missed') or new.status in ('attended','completed','missed')) then raise exception 'Only centre management can mark attendance'; end if;
  end if;
 end if;
 return new;
end $$;
create trigger guard_call_identity before update on public.call_logs for each row execute function private.guard_activity_identity();
create trigger guard_appointment_identity before update on public.appointments for each row execute function private.guard_activity_identity();

create function public.parent_phone_in_branch(phone text, target uuid default null, selected_branch uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor public.staff_profiles; scope uuid; contact text;
begin
 actor=private.current_staff();
 if actor.id is null then raise exception 'Access denied'; end if;
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

create function private.sync_appointment_handoff() returns trigger language plpgsql security definer set search_path='' as $$
declare latest uuid;
begin
 if tg_op='UPDATE' then
  if new.status is not distinct from old.status then return new; end if;
 end if;
 select id into latest from public.appointments where student_id=new.student_id order by created_at desc,id desc limit 1;
 if latest<>new.id then return new; end if;
 if new.status='scheduled' then
  update public.students set pipeline_stage='F2F Scheduled',next_call_at=null where id=new.student_id;
 elsif new.status='missed' then
  update public.students set pipeline_stage='F2F Missed',next_call_at=null where id=new.student_id and pipeline_stage not in ('Dropped','Closed','Admitted');
 elsif new.status in ('attended','completed','cancelled') then
  update public.students set pipeline_stage=case when new.status='cancelled' then 'Contacted' else 'Counselling' end,next_call_at=case when new.status='cancelled' then clock_timestamp() else null end
   where id=new.student_id and pipeline_stage in ('F2F Scheduled','F2F Missed','Meeting Scheduled');
 end if;
 return new;
end $$;
create trigger sync_appointment_handoff after insert or update of status on public.appointments for each row execute function private.sync_appointment_handoff();

create function public.counsellor_queue(queue_name text, page_number integer default 1) returns jsonb language sql stable set search_path='' as $$
 with leads as (
  select s.*,case when a.id is null then null else to_jsonb(a) end as latest_appointment,
   coalesce(s.next_call_at,c.next_callback_at) as callback_at,
   case
    when s.pipeline_stage in ('Dropped','Closed') then null
    when a.id is null and s.pipeline_stage='F2F Missed' then 'missed'
    when a.status='missed' and (s.pipeline_stage in ('F2F Missed','F2F Scheduled','Meeting Scheduled') or coalesce(s.next_call_at,c.next_callback_at) is null) then 'missed'
    when a.status='scheduled' and (s.pipeline_stage in ('F2F Scheduled','Meeting Scheduled') or coalesce(s.next_call_at,c.next_callback_at) is null) then 'invited'
    when (c.id is null and s.pipeline_stage='New Enquiry') or coalesce(s.next_call_at,c.next_callback_at)<((timezone('Asia/Kolkata',now())::date+1)::timestamp at time zone 'Asia/Kolkata') then 'to_call'
    else null end as queue
  from public.students s
  left join lateral(select * from public.appointments where student_id=s.id order by created_at desc,id desc limit 1) a on true
  left join lateral(select id,next_callback_at from public.call_logs where student_id=s.id order by created_at desc,id desc limit 1) c on true
  where public.my_role()='tele_counsellor' and s.branch_id=public.my_branch() and s.assigned_to=auth.uid()
 ), page as (
  select * from leads where queue=queue_name order by coalesce(callback_at,(latest_appointment->>'scheduled_at')::timestamptz,created_at),id limit 25 offset (greatest(1,least(page_number,1000000))-1)*25
 )
 select jsonb_build_object('students',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),'total',(select count(*) from leads where queue=queue_name),'counts',jsonb_build_object('to_call',(select count(*) from leads where queue='to_call'),'invited',(select count(*) from leads where queue='invited'),'missed',(select count(*) from leads where queue='missed')));
$$;

create function public.record_counsellor_action(target uuid,education jsonb,action_type text,request_id uuid default null,visit_at timestamptz default null,callback_at timestamptz default null,call_remarks text default null,reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles; s public.students; logged public.call_logs; meeting public.appointments;
begin
 actor=private.current_staff();
 if actor.role is distinct from 'tele_counsellor' then raise exception 'Access denied'; end if;
 select * into s from public.students where id=target for update;
 if s.id is null or s.branch_id<>actor.branch_id or s.assigned_to is distinct from actor.id then raise exception 'Access denied'; end if;
 if action_type not in ('details','invite','callback','no_answer','dropped') or action_type is null then raise exception 'Choose a valid call outcome'; end if;
 if action_type<>'details' then
  if request_id is null then raise exception 'Request identity required'; end if;
  select * into logged from public.call_logs where id=request_id;
  if logged.id is not null then
   if logged.student_id<>target or logged.logged_by<>actor.id then raise exception 'Access denied'; end if;
   select * into meeting from public.appointments where id=request_id;
   return jsonb_build_object('student_name',s.full_name,'appointment',case when meeting.id is null then null else to_jsonb(meeting) end,'call',to_jsonb(logged),'parent_phone_shared',public.parent_phone_in_branch(s.parent_phone,s.id,s.branch_id));
  end if;
 end if;
 if jsonb_typeof(education) is distinct from 'object' or length(trim(coalesce(education->>'full_name','')))=0 then raise exception 'Student name is required'; end if;
 if length(education->>'full_name')>150 or length(coalesce(call_remarks,''))>3000 then raise exception 'Entered text is too long'; end if;
 if action_type='invite' and visit_at is null then raise exception 'Visit date and time required'; end if;
 if action_type in ('callback','no_answer') and callback_at is null then raise exception 'Next callback date and time required'; end if;
 if action_type='dropped' and length(trim(coalesce(reason,'')))=0 then raise exception 'Drop reason required'; end if;
 update public.students set full_name=trim(education->>'full_name'),parent_phone=public.normalize_phone(education->>'parent_phone'),academic_stream=education->>'academic_stream',percentage_or_score=education->>'percentage_or_score',target_course=education->>'target_course',preferred_locations=education->>'preferred_locations',budget_range=education->>'budget_range' where id=target returning * into s;
 if action_type='invite' then
  update public.appointments set status='cancelled' where student_id=target and status='scheduled';
  insert into public.appointments(id,student_id,branch_id,scheduled_at,created_by,created_at) values(request_id,target,s.branch_id,visit_at,actor.id,clock_timestamp()) returning * into meeting;
 elsif action_type='dropped' then
  update public.appointments set status='cancelled' where student_id=target and status='scheduled';
  update public.students set pipeline_stage='Dropped',drop_reason=trim(reason),next_call_at=null where id=target;
 elsif action_type in ('callback','no_answer') then
  update public.appointments set status='cancelled' where student_id=target and status='scheduled';
  update public.students set pipeline_stage='Contacted',next_call_at=callback_at where id=target;
 end if;
 if action_type='details' then
  select * into meeting from public.appointments where student_id=target and status='scheduled' order by created_at desc,id desc limit 1;
 end if;
 if action_type<>'details' then
  insert into public.call_logs(id,student_id,branch_id,logged_by,outcome,remarks,next_callback_at,created_at)
   values(request_id,target,s.branch_id,actor.id,case action_type when 'invite' then 'Agreed to Meet' when 'callback' then 'Call Back Later' when 'no_answer' then 'No Answer' else 'Not Interested / Dropped' end,case when action_type='dropped' then concat_ws(E'\n',nullif(trim(call_remarks),''),'Drop reason: '||trim(reason)) else call_remarks end,case when action_type in ('callback','no_answer') then callback_at end,clock_timestamp()) returning * into logged;
 end if;
 return jsonb_build_object('student_name',s.full_name,'appointment',case when meeting.id is null then null else to_jsonb(meeting) end,'call',case when logged.id is null then null else to_jsonb(logged) end,'parent_phone_shared',public.parent_phone_in_branch(s.parent_phone,s.id,s.branch_id));
end $$;
revoke execute on function public.parent_phone_in_branch(text,uuid,uuid),public.counsellor_queue(text,integer),public.record_counsellor_action(uuid,jsonb,text,uuid,timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.parent_phone_in_branch(text,uuid,uuid),public.counsellor_queue(text,integer),public.record_counsellor_action(uuid,jsonb,text,uuid,timestamptz,timestamptz,text,text) to authenticated;
