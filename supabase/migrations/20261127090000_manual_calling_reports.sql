-- Manual desks also use the restricted one-lead queue; only this explicit mode releases its current number.
alter table public.branches add column manual_calling boolean not null default false check (not manual_calling or secure_calling);
alter table public.students add column import_file text, add column call_campaign text;
create function private.import_call_labels() returns trigger language plpgsql set search_path='' as $$
begin
 new.import_file=nullif(current_setting('portal.import_file',true),'');
 new.call_campaign=nullif(current_setting('portal.call_campaign',true),'');
 return new;
end $$;
create trigger import_call_labels before insert on public.students for each row execute function private.import_call_labels();

create function public.import_calling_leads(target_branch uuid,file_name text,lead_rows jsonb,assignment_mode text,caller_ids uuid[],source_name text,received_on date,consent text,campaign text)
returns jsonb language plpgsql set search_path='' as $$
begin
 if length(campaign)>150 then raise exception 'Campaign too long'; end if;
 perform set_config('portal.import_file',file_name,true),set_config('portal.call_campaign',coalesce(trim(campaign),''),true);
 return public.bulk_import_leads(target_branch,file_name,lead_rows,assignment_mode,caller_ids,source_name,received_on,consent);
end $$;

create type private.manual_status as enum ('appearing','interested','busy','callback','incoming_unavailable','not_interested','not_reachable','no_answer','invalid_number','switched_off','admission_taken','wrong_number','next_year');
create table private.manual_calls (
 id uuid primary key, student_id uuid references public.students(id) on delete set null, caller_id uuid not null references public.staff_profiles(id),
 branch_id uuid not null references public.branches(id), day date not null, status private.manual_status not null,
 file_name text not null, campaign text not null, created_at timestamptz not null default clock_timestamp(),
 previous_state jsonb not null, saved_state jsonb not null, undone boolean not null default false
);
create index manual_calls_daily on private.manual_calls(caller_id,branch_id,day);
create table private.caller_daily_notes (
 caller_id uuid references public.staff_profiles(id), branch_id uuid references public.branches(id), day date,
 note text not null check(length(note)<=1000), primary key(caller_id,branch_id,day)
);
alter table private.caller_daily_notes enable row level security;
alter table private.manual_calls enable row level security;

create function private.manual_actor() returns public.staff_profiles language plpgsql stable security definer set search_path='' as $$
declare actor public.staff_profiles:=private.secure_caller();
begin
 if not exists(select 1 from public.branches where id=actor.branch_id and manual_calling) then raise exception 'Manual desk unavailable'; end if;
 return actor;
end $$;
create function public.manual_desk() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles:=private.manual_actor(); target uuid:=public.next_lead(); lead jsonb;
begin
 select jsonb_build_object('id',s.id,'name',split_part(trim(s.full_name),' ',1),'phone',s.student_phone,'course',s.target_course,
   'file',coalesce(s.import_file,s.lead_source,'Unspecified file'),'campaign',s.call_campaign,'assignment',c.assigned_at)
 into lead from public.students s join private.caller_current_lead c on c.student_id=s.id
 where s.id=target and s.branch_id=actor.branch_id and s.assigned_to=actor.id and s.calling_status='eligible' and c.caller_id=actor.id;
 if lead is not null then
  insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
  values(actor.id,actor.role,actor.branch_id,'view_number','students',target,'{}');
 end if;
 return jsonb_build_object('lead',lead,'target',actor.daily_attempt_target,'total',(select count(*) from private.manual_calls
 where caller_id=actor.id and branch_id=actor.branch_id and day=timezone('Asia/Kolkata',now())::date and not undone));
end $$;

create function private.manual_state(s public.students) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('stage',s.pipeline_stage,'next',s.next_call_at,'status',s.calling_status,'note',s.calling_note)
$$;
create function public.save_manual_call(target uuid, assignment timestamptz, request_id uuid, outcome text, remark text, callback_at timestamptz)
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
 old_state=private.manual_state(s);
 follow_up=case when status='callback' then callback_at when status in ('busy','switched_off','incoming_unavailable','not_reachable','no_answer') then now()+interval '1 day' end;
 update public.students set pipeline_stage=case when status in ('admission_taken','not_interested') then 'Closed' else 'Contacted' end,
 next_call_at=follow_up,calling_status=case when status in ('invalid_number','wrong_number') then 'held' else calling_status end,
 calling_note=case when status in ('invalid_number','wrong_number') then replace(outcome,'_',' ') else calling_note end where id=s.id returning * into s;
 insert into private.manual_calls(id,student_id,caller_id,branch_id,day,status,file_name,campaign,previous_state,saved_state)
 values(request_id,target,actor.id,actor.branch_id,day_ist,status,coalesce(s.import_file,s.lead_source,'Unspecified file'),coalesce(s.call_campaign,''),old_state,private.manual_state(s));
 insert into public.call_logs(id,student_id,branch_id,logged_by,outcome,remarks,next_callback_at)
 values(request_id,target,actor.branch_id,actor.id,case status when 'appearing' then 'Appearing '||extract(year from day_ist)::int when 'next_year' then 'Next year '||(extract(year from day_ist)::int+1) else initcap(replace(outcome,'_',' ')) end,nullif(trim(remark),''),follow_up);
 delete from private.caller_current_lead where caller_id=actor.id;
end $$;

-- Only the latest entry can be corrected, and only while its effects are intact.
create function public.manual_followup(entry_id uuid, visit_at timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles:=private.manual_actor(); e private.manual_calls; s public.students;
begin
 perform pg_advisory_xact_lock(hashtextextended('caller-lead:'||actor.id::text,0));
 select * into e from private.manual_calls where caller_id=actor.id and branch_id=actor.branch_id and day=timezone('Asia/Kolkata',now())::date and not undone order by created_at desc limit 1;
 if e.id is null or entry_id is distinct from e.id then raise exception 'Entry changed'; end if;
 select * into s from public.students where id=e.student_id and branch_id=actor.branch_id and assigned_to=actor.id for update;
 if s.id is null or private.manual_state(s)<>e.saved_state or exists(select 1 from public.appointments where student_id=s.id and created_at>=e.created_at)
 or exists(select 1 from public.call_logs where student_id=s.id and id<>e.id and created_at>=e.created_at) then raise exception 'Student has changed'; end if;
 if visit_at is not null then
  if e.status<>'interested' or visit_at<=now() then raise exception 'Choose a future visit for an interested student'; end if;
  insert into public.appointments(id,student_id,branch_id,scheduled_at,status,created_by) values(e.id,s.id,actor.branch_id,visit_at,'scheduled',actor.id);
  update public.students set pipeline_stage='F2F Scheduled',next_call_at=null where id=s.id;
 else
  update public.students set pipeline_stage=e.previous_state->>'stage',next_call_at=(e.previous_state->>'next')::timestamptz,
   calling_status=e.previous_state->>'status',calling_note=e.previous_state->>'note' where id=s.id;
  update private.manual_calls set undone=true where id=e.id;
  delete from public.call_logs where id=e.id;
  delete from private.caller_current_lead where caller_id=actor.id;
  insert into private.caller_current_lead(caller_id,student_id) values(actor.id,s.id);
 end if;
end $$;

create function public.daily_call_report(target uuid, report_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.staff_profiles:=private.current_staff(); caller public.staff_profiles;
begin
 select * into caller from public.staff_profiles where id=target and role='tele_counsellor';
 if caller.id is null or actor.id is null or not(actor.id=target or public.can_manage_branch(caller.branch_id)) then raise exception 'Access denied'; end if;
 return jsonb_build_object('name',caller.full_name,'date',report_day,'recipient',(select string_agg(email,',' order by email) from public.staff_profiles where branch_id=caller.branch_id and role='centre_head' and is_active),
 'note',coalesce((select note from private.caller_daily_notes where caller_id=target and branch_id=caller.branch_id and day=report_day),''),
 'groups',coalesce((select jsonb_agg(to_jsonb(g) order by g.file,g.campaign,g.status) from (select file_name as file,campaign,status,count(*) as count from private.manual_calls
 where caller_id=target and branch_id=caller.branch_id and day=report_day and not undone group by file_name,campaign,status) g),'[]'::jsonb));
end $$;
create function public.save_daily_call_note(report_day date, daily_note text) returns void language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles:=private.current_staff();
begin
 if actor.role is distinct from 'tele_counsellor' or report_day>timezone('Asia/Kolkata',now())::date then raise exception 'Access denied';end if;
 insert into private.caller_daily_notes values(actor.id,actor.branch_id,report_day,trim(daily_note))
 on conflict(caller_id,branch_id,day) do update set note=excluded.note;
end $$;
revoke all on function private.manual_actor(), private.manual_state(public.students),private.import_call_labels() from public,anon,authenticated;
revoke all on function public.import_calling_leads(uuid,text,jsonb,text,uuid[],text,date,text,text),public.manual_desk(),
 public.save_manual_call(uuid,timestamptz,uuid,text,text,timestamptz),public.manual_followup(uuid,timestamptz),
 public.daily_call_report(uuid,date),public.save_daily_call_note(date,text) from public,anon;
grant execute on function public.import_calling_leads(uuid,text,jsonb,text,uuid[],text,date,text,text),public.manual_desk(),
 public.save_manual_call(uuid,timestamptz,uuid,text,text,timestamptz),public.manual_followup(uuid,timestamptz),
 public.daily_call_report(uuid,date),public.save_daily_call_note(date,text) to authenticated;
