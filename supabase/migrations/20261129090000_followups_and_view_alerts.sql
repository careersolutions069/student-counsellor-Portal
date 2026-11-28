-- Interested in one click with a Centre Head follow-up list, alerts for unusual number viewing
-- instead of a fixed delay, and same-round re-imports that never queue a student twice.

-- Interested follow-ups. A pending row clears when any visit is booked for the student.
create table private.interested_followups (
 entry_id uuid primary key,
 student_id uuid not null references public.students(id) on delete cascade,
 branch_id uuid not null references public.branches(id),
 caller_id uuid not null references public.staff_profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 resolved_at timestamptz,
 resolution text check (resolution in ('visit_booked','dismissed','superseded'))
);
create unique index interested_followups_one_pending on private.interested_followups(student_id) where resolved_at is null;
create index interested_followups_branch on private.interested_followups(branch_id) where resolved_at is null;
alter table private.interested_followups enable row level security;

create function private.clear_followup_on_visit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='scheduled' then
  update private.interested_followups set resolved_at=clock_timestamp(),resolution='visit_booked' where student_id=new.student_id and resolved_at is null;
 end if;
 return new;
end $$;
create trigger clear_followup_on_visit after insert on public.appointments for each row execute function private.clear_followup_on_visit();

-- Number-view alerts. Each student counts once per caller within the window, however often the desk reloads.
create table private.number_views (
 caller_id uuid not null references public.staff_profiles(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 branch_id uuid not null references public.branches(id),
 viewed_at timestamptz not null default clock_timestamp()
);
create index number_views_recent on private.number_views(caller_id,viewed_at desc);
alter table private.number_views enable row level security;

create table public.caller_alerts (
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id),
 caller_id uuid not null references public.staff_profiles(id) on delete cascade,
 numbers_viewed integer not null,
 window_start timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 reviewed_by uuid references public.staff_profiles(id),
 reviewed_at timestamptz
);
create index caller_alerts_branch on public.caller_alerts(branch_id,created_at desc);
alter table public.caller_alerts enable row level security;
revoke all on public.caller_alerts from public,anon,authenticated;
grant select on public.caller_alerts to authenticated;
-- Only Centre Heads of the caller's branch (and the Owner) see the alert. The caller does not.
create policy caller_alerts_read on public.caller_alerts for select to authenticated using (public.can_manage_branch(branch_id));
create trigger audit_caller_alerts after insert or update on public.caller_alerts for each row execute function private.audit_change();

-- 40 different numbers in 15 minutes is one every 22 seconds, sustained. The daily target needs one every 48 seconds.
create function private.record_number_view(actor public.staff_profiles, target uuid) returns void language plpgsql security definer set search_path='' as $$
declare window_length constant interval:='15 minutes'; threshold constant integer:=40; seen integer; first_view timestamptz; open_alert uuid;
begin
 if exists(select 1 from private.number_views where caller_id=actor.id and student_id=target and viewed_at>clock_timestamp()-window_length) then return; end if;
 insert into private.number_views(caller_id,student_id,branch_id) values(actor.id,target,actor.branch_id);
 select count(distinct student_id),min(viewed_at) into seen,first_view from private.number_views where caller_id=actor.id and viewed_at>clock_timestamp()-window_length;
 if seen<threshold then return; end if;
 select id into open_alert from public.caller_alerts where caller_id=actor.id and reviewed_at is null and updated_at>clock_timestamp()-window_length order by created_at desc limit 1;
 if open_alert is null then
  insert into public.caller_alerts(branch_id,caller_id,numbers_viewed,window_start) values(actor.branch_id,actor.id,seen,first_view);
 else
  update public.caller_alerts set numbers_viewed=greatest(numbers_viewed,seen),updated_at=clock_timestamp() where id=open_alert;
 end if;
end $$;

create or replace function public.manual_desk() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles:=private.manual_actor(); target uuid:=public.next_lead(); lead jsonb;
begin
 select jsonb_build_object('id',s.id,'name',split_part(trim(s.full_name),' ',1),'phone',s.student_phone,'course',s.target_course,
   'file',coalesce(s.import_file,s.lead_source,'Unspecified file'),'campaign',s.call_campaign,'assignment',c.assigned_at)
 into lead from public.students s join private.caller_current_lead c on c.student_id=s.id
 where s.id=target and s.branch_id=actor.branch_id and s.assigned_to=actor.id and s.calling_status='eligible' and c.caller_id=actor.id;
 if lead is not null then
  insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
  values(actor.id,actor.role,actor.branch_id,'view_number','students',target,'{}');
  perform private.record_number_view(actor,target);
 end if;
 return jsonb_build_object('lead',lead,'target',actor.daily_attempt_target,'total',(select count(*) from private.manual_calls
 where caller_id=actor.id and branch_id=actor.branch_id and day=timezone('Asia/Kolkata',now())::date and not undone));
end $$;

-- Logging a call: no fixed delay. Interested saves in one click; a visit or callback is optional.
create or replace function public.save_manual_call(target uuid, assignment timestamptz, request_id uuid, outcome text, remark text, callback_at timestamptz, visit_at timestamptz default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles:=private.manual_actor(); s public.students; old_state jsonb; entry private.manual_calls;
 status private.manual_status:=outcome::private.manual_status; follow_up timestamptz; day_ist date:=timezone('Asia/Kolkata',now())::date;
begin
 perform pg_advisory_xact_lock(hashtextextended('caller-lead:'||actor.id::text,0));
 select * into entry from private.manual_calls where id=request_id;
 if found then
  if entry.student_id=target and entry.caller_id=actor.id and entry.branch_id=actor.branch_id and entry.status=status and not entry.undone then return; end if;
  raise exception 'Entry changed';
 end if;
 select st.* into s from public.students st join private.caller_current_lead c on c.student_id=st.id
 where st.id=target and c.caller_id=actor.id and c.assigned_at=assignment and st.branch_id=actor.branch_id and st.assigned_to=actor.id
 and st.calling_status='eligible' and st.pipeline_stage not in ('Dropped','Closed','Admitted') for update of st;
 if s.id is null or request_id is null or status is null or length(remark)>2000 then raise exception 'Invalid entry or assignment'; end if;
 if status='callback' and (callback_at is null or callback_at<=now()) then raise exception 'Choose a future callback time'; end if;
 if status='interested' and visit_at is not null and callback_at is not null then raise exception 'Choose a visit or a callback, not both.'; end if;
 if status='interested' and coalesce(visit_at,callback_at)<=now() then raise exception 'Choose a future time.'; end if;
 if status<>'interested' and visit_at is not null then raise exception 'Invalid entry or assignment'; end if;
 old_state=private.manual_state(s);
 follow_up=case when status in ('callback','interested') then callback_at when status in ('busy','switched_off','incoming_unavailable','not_reachable','no_answer') then now()+interval '1 day' end;
 update public.students set pipeline_stage=case when status in ('admission_taken','not_interested') then 'Closed' else 'Contacted' end,
 next_call_at=follow_up,calling_status=case when status in ('invalid_number','wrong_number') then 'held' else calling_status end,
 calling_note=case when status in ('invalid_number','wrong_number') then replace(outcome,'_',' ') else calling_note end where id=s.id;
 if status='interested' and visit_at is null then
  update private.interested_followups set resolved_at=clock_timestamp(),resolution='superseded' where student_id=s.id and resolved_at is null;
  insert into private.interested_followups(entry_id,student_id,branch_id,caller_id) values(request_id,s.id,actor.branch_id,actor.id);
 end if;
 if visit_at is not null then
  insert into public.appointments(id,student_id,branch_id,scheduled_at,status,created_by) values(request_id,s.id,actor.branch_id,visit_at,'scheduled',actor.id);
 end if;
 select * into s from public.students where id=s.id;
 insert into private.manual_calls(id,student_id,caller_id,branch_id,day,status,file_name,campaign,previous_state,saved_state)
 values(request_id,target,actor.id,actor.branch_id,day_ist,status,coalesce(s.import_file,s.lead_source,'Unspecified file'),coalesce(s.call_campaign,''),old_state,private.manual_state(s));
 insert into public.call_logs(id,student_id,branch_id,logged_by,outcome,remarks,next_callback_at)
 values(request_id,target,actor.branch_id,actor.id,case status when 'appearing' then 'Appearing '||extract(year from day_ist)::int when 'next_year' then 'Next year '||(extract(year from day_ist)::int+1) else initcap(replace(outcome,'_',' ')) end,nullif(trim(remark),''),follow_up);
 delete from private.caller_current_lead where caller_id=actor.id;
end $$;

-- Follow-up on the latest entry: book a visit, set a callback, or undo the entry.
drop function public.manual_followup(uuid,timestamptz);
create function public.manual_followup(entry_id uuid, visit_at timestamptz default null, callback_at timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles:=private.manual_actor(); e private.manual_calls; s public.students;
begin
 perform pg_advisory_xact_lock(hashtextextended('caller-lead:'||actor.id::text,0));
 select * into e from private.manual_calls where caller_id=actor.id and branch_id=actor.branch_id and day=timezone('Asia/Kolkata',now())::date and not undone order by created_at desc limit 1;
 if e.id is null or entry_id is distinct from e.id then raise exception 'Entry changed'; end if;
 select * into s from public.students where id=e.student_id and branch_id=actor.branch_id and assigned_to=actor.id for update;
 if s.id is null or private.manual_state(s)<>e.saved_state
 or exists(select 1 from public.appointments where student_id=s.id and id<>e.id and created_at>=e.created_at)
 or exists(select 1 from public.call_logs where student_id=s.id and id<>e.id and created_at>=e.created_at) then raise exception 'Student has changed'; end if;
 if visit_at is not null and callback_at is not null then raise exception 'Choose a visit or a callback, not both.'; end if;
 if visit_at is not null then
  if e.status<>'interested' or visit_at<=now() or exists(select 1 from public.appointments where id=e.id) then raise exception 'Choose a future visit for an interested student'; end if;
  insert into public.appointments(id,student_id,branch_id,scheduled_at,status,created_by) values(e.id,s.id,actor.branch_id,visit_at,'scheduled',actor.id);
  update public.students set pipeline_stage='F2F Scheduled',next_call_at=null where id=s.id;
  update private.manual_calls set saved_state=private.manual_state((select x from public.students x where x.id=s.id)) where id=e.id;
 elsif callback_at is not null then
  if e.status<>'interested' or callback_at<=now() then raise exception 'Choose a future callback time'; end if;
  update public.students set next_call_at=callback_at where id=s.id;
  update public.call_logs set next_callback_at=callback_at where id=e.id;
  update private.manual_calls set saved_state=private.manual_state((select x from public.students x where x.id=s.id)) where id=e.id;
 else
  delete from public.appointments where id=e.id;
  delete from private.interested_followups f where f.entry_id=e.id;
  update public.students set pipeline_stage=e.previous_state->>'stage',next_call_at=(e.previous_state->>'next')::timestamptz,
   calling_status=e.previous_state->>'status',calling_note=e.previous_state->>'note' where id=s.id;
  update private.manual_calls set undone=true where id=e.id;
  delete from public.call_logs where id=e.id;
  delete from private.caller_current_lead where caller_id=actor.id;
  insert into private.caller_current_lead(caller_id,student_id) values(actor.id,s.id);
 end if;
end $$;

-- Centre Head: pending Interested follow-ups for the branch.
create function public.interested_followups(selected_branch uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scope uuid:=case when public.my_role()='owner' then selected_branch else public.my_branch() end;
begin
 if scope is null or not public.can_manage_branch(scope) then raise exception 'Access denied'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('entry_id',f.entry_id,'student_id',s.id,'full_name',s.full_name,'phone',s.student_phone,
   'caller',p.full_name,'file',m.file_name,'campaign',m.campaign,'logged_at',f.created_at,'callback_at',s.next_call_at,'remark',l.remarks) order by f.created_at)
  from private.interested_followups f join public.students s on s.id=f.student_id join public.staff_profiles p on p.id=f.caller_id
  left join private.manual_calls m on m.id=f.entry_id left join public.call_logs l on l.id=f.entry_id
  where f.branch_id=scope and f.resolved_at is null and s.branch_id=scope),'[]'::jsonb);
end $$;

create function public.book_followup_visit(entry uuid, visit_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare f private.interested_followups; actor public.staff_profiles:=private.current_staff();
begin
 select * into f from private.interested_followups where entry_id=entry and resolved_at is null for update;
 if f.entry_id is null or not public.can_manage_branch(f.branch_id) or actor.role='tele_counsellor' then raise exception 'Access denied'; end if;
 if visit_at is null or visit_at<=now() then raise exception 'Choose a future visit time.'; end if;
 update public.appointments set status='cancelled' where student_id=f.student_id and status='scheduled';
 insert into public.appointments(student_id,branch_id,scheduled_at,status,created_by) values(f.student_id,f.branch_id,visit_at,'scheduled',actor.id);
end $$;

create function public.dismiss_followup(entry uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.interested_followups set resolved_at=clock_timestamp(),resolution='dismissed'
 where entry_id=entry and resolved_at is null and public.can_manage_branch(branch_id) and public.my_role()<>'tele_counsellor';
 if not found then raise exception 'Access denied'; end if;
end $$;

create function public.review_caller_alert(alert uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.caller_alerts set reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=alert and reviewed_at is null and public.can_manage_branch(branch_id);
 if not found then raise exception 'Access denied'; end if;
end $$;

-- Re-importing the same file for the same round never queues a student twice.
create or replace function public.import_calling_leads(target_branch uuid,file_name text,lead_rows jsonb,assignment_mode text,caller_ids uuid[],source_name text,received_on date,consent text,campaign text,requeue boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare summary jsonb; result jsonb; out_rows jsonb:='[]'; item jsonb; phone text; s public.students; requeued int:=0; turn int:=0; round_label text:=coalesce(nullif(trim(campaign),''),'');
begin
 if length(campaign)>150 then raise exception 'Campaign too long'; end if;
 perform set_config('portal.import_file',file_name,true),set_config('portal.call_campaign',round_label,true);
 summary=public.bulk_import_leads(target_branch,file_name,lead_rows,assignment_mode,caller_ids,source_name,received_on,consent);
 if not coalesce(requeue,false) then return summary; end if;
 for result in select value from jsonb_array_elements(summary->'rows') loop
  if result->>'status'='duplicate' and result->>'reason'='Student Phone already registered.' then
   select value into item from jsonb_array_elements(lead_rows) where value->>'row_number'=result->>'row_number' limit 1;
   phone=public.normalize_phone(item->>'student_phone');
   select * into s from public.students where student_phone=phone and branch_id=target_branch for update;
   if s.id is null then
    result=result||jsonb_build_object('reason','Already registered in another branch · not queued.');
   elsif s.import_file is not distinct from file_name and coalesce(s.call_campaign,'')=round_label then
    result=result||jsonb_build_object('reason','Already in this round · not queued again.');
   elsif s.calling_status<>'eligible' or s.pipeline_stage in ('Dropped','Closed','Admitted') then
    result=result||jsonb_build_object('reason',case when s.calling_status='do_not_contact' then 'Already in portal · Do not call, not queued.' when s.calling_status='held' then 'Already in portal · held, not queued.' else 'Already in portal · closed, not queued.' end);
   else
    update public.students set import_file=file_name,call_campaign=nullif(round_label,''),
     assigned_to=case when assignment_mode='unassigned' then assigned_to else caller_ids[1+(turn%cardinality(caller_ids))] end,
     next_call_at=clock_timestamp()
    where id=s.id;
    turn=turn+1;requeued=requeued+1;
    result=result||jsonb_build_object('status','requeued','reason','Already in portal · back in the queue for this round.');
   end if;
  end if;
  out_rows=out_rows||jsonb_build_array(result);
 end loop;
 return summary||jsonb_build_object('rows',out_rows,'requeued_count',requeued,'duplicate_count',(summary->>'duplicate_count')::int-requeued);
end $$;

revoke all on function private.record_number_view(public.staff_profiles,uuid),private.clear_followup_on_visit() from public,anon,authenticated;
revoke all on function public.manual_followup(uuid,timestamptz,timestamptz),public.interested_followups(uuid),public.book_followup_visit(uuid,timestamptz),
 public.dismiss_followup(uuid),public.review_caller_alert(uuid) from public,anon;
grant execute on function public.manual_followup(uuid,timestamptz,timestamptz),public.interested_followups(uuid),public.book_followup_visit(uuid,timestamptz),
 public.dismiss_followup(uuid),public.review_caller_alert(uuid) to authenticated;
