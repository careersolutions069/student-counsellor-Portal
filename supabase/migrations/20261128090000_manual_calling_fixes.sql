-- Manual calling fixes: repeat-call rounds, a floor between logged calls, and no interested lead without a next step.

-- 1. Repeat-call rounds. With requeue on, students already in this branch take the new file, campaign and caller,
--    and return to the queue. Held, Do not call, closed, dropped and admitted students are left alone.
drop function public.import_calling_leads(uuid,text,jsonb,text,uuid[],text,date,text,text);
create function public.import_calling_leads(target_branch uuid,file_name text,lead_rows jsonb,assignment_mode text,caller_ids uuid[],source_name text,received_on date,consent text,campaign text,requeue boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare summary jsonb; result jsonb; out_rows jsonb:='[]'; item jsonb; phone text; s public.students; requeued int:=0; turn int:=0;
begin
 if length(campaign)>150 then raise exception 'Campaign too long'; end if;
 perform set_config('portal.import_file',file_name,true),set_config('portal.call_campaign',coalesce(trim(campaign),''),true);
 summary=public.bulk_import_leads(target_branch,file_name,lead_rows,assignment_mode,caller_ids,source_name,received_on,consent);
 if not coalesce(requeue,false) then return summary; end if;
 for result in select value from jsonb_array_elements(summary->'rows') loop
  if result->>'status'='duplicate' and result->>'reason'='Student Phone already registered.' then
   select value into item from jsonb_array_elements(lead_rows) where value->>'row_number'=result->>'row_number' limit 1;
   phone=public.normalize_phone(item->>'student_phone');
   select * into s from public.students where student_phone=phone and branch_id=target_branch for update;
   if s.id is null then
    result=result||jsonb_build_object('reason','Already registered in another branch · not queued.');
   elsif s.calling_status<>'eligible' or s.pipeline_stage in ('Dropped','Closed','Admitted') then
    result=result||jsonb_build_object('reason',case when s.calling_status='do_not_contact' then 'Already in portal · Do not call, not queued.' when s.calling_status='held' then 'Already in portal · held, not queued.' else 'Already in portal · closed, not queued.' end);
   else
    update public.students set import_file=file_name,call_campaign=nullif(trim(campaign),''),
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

-- A requeued student is due again even if never called before or no longer a New Enquiry.
create or replace function public.next_lead() returns uuid language plpgsql security definer set search_path='' as $$
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
   and ((s.next_call_at<=now()) or (a.status='missed' and s.pipeline_stage='F2F Missed') or (l.id is null and s.pipeline_stage='New Enquiry'))
  order by case when l.id is not null and s.next_call_at<=now() then 0 when a.status='missed' then 1 else 2 end,coalesce(s.next_call_at,s.created_at),s.id
  limit 1 for update of s skip locked;
 if picked is null then return null; end if;
 insert into private.caller_current_lead(caller_id,student_id) values(actor.id,picked);
 return picked;
end $$;

-- 2 and 4. Logging a call: at least 10 seconds after the previous one, and Interested needs a visit or a callback.
drop function public.save_manual_call(uuid,timestamptz,uuid,text,text,timestamptz);
create function public.save_manual_call(target uuid, assignment timestamptz, request_id uuid, outcome text, remark text, callback_at timestamptz, visit_at timestamptz default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles:=private.manual_actor(); s public.students; old_state jsonb; entry private.manual_calls; previous timestamptz;
 status private.manual_status:=outcome::private.manual_status; follow_up timestamptz; day_ist date:=timezone('Asia/Kolkata',now())::date;
begin
 perform pg_advisory_xact_lock(hashtextextended('caller-lead:'||actor.id::text,0));
 select * into entry from private.manual_calls where id=request_id;
 if found then
  if entry.student_id=target and entry.caller_id=actor.id and entry.branch_id=actor.branch_id and entry.status=status and not entry.undone then return; end if;
  raise exception 'Entry changed';
 end if;
 -- A real manual call takes longer than this. Faster entries would only cycle through numbers.
 select max(created_at) into previous from private.manual_calls where caller_id=actor.id and not undone;
 if previous>clock_timestamp()-interval '10 seconds' then raise exception 'Wait a few seconds before logging the next call.'; end if;
 select st.* into s from public.students st join private.caller_current_lead c on c.student_id=st.id
 where st.id=target and c.caller_id=actor.id and c.assigned_at=assignment and st.branch_id=actor.branch_id and st.assigned_to=actor.id
 and st.calling_status='eligible' and st.pipeline_stage not in ('Dropped','Closed','Admitted') for update of st;
 if s.id is null or request_id is null or status is null or length(remark)>2000 then raise exception 'Invalid entry or assignment'; end if;
 if status='callback' and (callback_at is null or callback_at<=now()) then raise exception 'Choose a future callback time'; end if;
 if status='interested' and (visit_at is null)=(callback_at is null) then raise exception 'Book a visit or choose a callback time for an interested student.'; end if;
 if status='interested' and coalesce(visit_at,callback_at)<=now() then raise exception 'Choose a future time.'; end if;
 if status<>'interested' and visit_at is not null then raise exception 'Invalid entry or assignment'; end if;
 old_state=private.manual_state(s);
 follow_up=case when status in ('callback','interested') then callback_at when status in ('busy','switched_off','incoming_unavailable','not_reachable','no_answer') then now()+interval '1 day' end;
 update public.students set pipeline_stage=case when status in ('admission_taken','not_interested') then 'Closed' else 'Contacted' end,
 next_call_at=follow_up,calling_status=case when status in ('invalid_number','wrong_number') then 'held' else calling_status end,
 calling_note=case when status in ('invalid_number','wrong_number') then replace(outcome,'_',' ') else calling_note end where id=s.id;
 if visit_at is not null then
  -- The appointment trigger moves the student to F2F Scheduled; the Centre Head sees it under F2F Appointments.
  insert into public.appointments(id,student_id,branch_id,scheduled_at,status,created_by) values(request_id,s.id,actor.branch_id,visit_at,'scheduled',actor.id);
 end if;
 select * into s from public.students where id=s.id;
 insert into private.manual_calls(id,student_id,caller_id,branch_id,day,status,file_name,campaign,previous_state,saved_state)
 values(request_id,target,actor.id,actor.branch_id,day_ist,status,coalesce(s.import_file,s.lead_source,'Unspecified file'),coalesce(s.call_campaign,''),old_state,private.manual_state(s));
 insert into public.call_logs(id,student_id,branch_id,logged_by,outcome,remarks,next_callback_at)
 values(request_id,target,actor.branch_id,actor.id,case status when 'appearing' then 'Appearing '||extract(year from day_ist)::int when 'next_year' then 'Next year '||(extract(year from day_ist)::int+1) else initcap(replace(outcome,'_',' ')) end,nullif(trim(remark),''),follow_up);
 delete from private.caller_current_lead where caller_id=actor.id;
end $$;

-- Undo also removes a visit booked with the entry. Booking later is still allowed for the latest entry.
create or replace function public.manual_followup(entry_id uuid, visit_at timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles:=private.manual_actor(); e private.manual_calls; s public.students;
begin
 perform pg_advisory_xact_lock(hashtextextended('caller-lead:'||actor.id::text,0));
 select * into e from private.manual_calls where caller_id=actor.id and branch_id=actor.branch_id and day=timezone('Asia/Kolkata',now())::date and not undone order by created_at desc limit 1;
 if e.id is null or entry_id is distinct from e.id then raise exception 'Entry changed'; end if;
 select * into s from public.students where id=e.student_id and branch_id=actor.branch_id and assigned_to=actor.id for update;
 if s.id is null or private.manual_state(s)<>e.saved_state
 or exists(select 1 from public.appointments where student_id=s.id and id<>e.id and created_at>=e.created_at)
 or exists(select 1 from public.call_logs where student_id=s.id and id<>e.id and created_at>=e.created_at) then raise exception 'Student has changed'; end if;
 if visit_at is not null then
  if e.status<>'interested' or visit_at<=now() or exists(select 1 from public.appointments where id=e.id) then raise exception 'Choose a future visit for an interested student'; end if;
  insert into public.appointments(id,student_id,branch_id,scheduled_at,status,created_by) values(e.id,s.id,actor.branch_id,visit_at,'scheduled',actor.id);
  update public.students set pipeline_stage='F2F Scheduled',next_call_at=null where id=s.id;
  update private.manual_calls set saved_state=private.manual_state((select x from public.students x where x.id=s.id)) where id=e.id;
 else
  delete from public.appointments where id=e.id;
  update public.students set pipeline_stage=e.previous_state->>'stage',next_call_at=(e.previous_state->>'next')::timestamptz,
   calling_status=e.previous_state->>'status',calling_note=e.previous_state->>'note' where id=s.id;
  update private.manual_calls set undone=true where id=e.id;
  delete from public.call_logs where id=e.id;
  delete from private.caller_current_lead where caller_id=actor.id;
  insert into private.caller_current_lead(caller_id,student_id) values(actor.id,s.id);
 end if;
end $$;

-- 2. Centre Head view of manual desks: calls logged today and how many came within 20 seconds of the previous one.
create function public.manual_activity(selected_branch uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scope uuid:=case when public.my_role()='owner' then selected_branch else public.my_branch() end;
begin
 if scope is null or not public.can_manage_branch(scope) then raise exception 'Access denied'; end if;
 return coalesce((select jsonb_object_agg(caller_id,jsonb_build_object('logged',logged,'quick',quick)) from (
  select caller_id,count(*) as logged,count(*) filter (where gap<interval '20 seconds') as quick from (
   select caller_id,created_at-lag(created_at) over (partition by caller_id order by created_at) as gap from private.manual_calls
   where branch_id=scope and day=timezone('Asia/Kolkata',now())::date and not undone) g group by caller_id) t),'{}'::jsonb);
end $$;

revoke all on function public.import_calling_leads(uuid,text,jsonb,text,uuid[],text,date,text,text,boolean),
 public.save_manual_call(uuid,timestamptz,uuid,text,text,timestamptz,timestamptz),public.manual_activity(uuid) from public,anon;
grant execute on function public.import_calling_leads(uuid,text,jsonb,text,uuid[],text,date,text,text,boolean),
 public.save_manual_call(uuid,timestamptz,uuid,text,text,timestamptz,timestamptz),public.manual_activity(uuid) to authenticated;
