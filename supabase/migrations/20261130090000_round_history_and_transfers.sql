-- Every round a student has been queued in, so re-importing an older round (Round 1, Round 2, Round 1 again) queues nobody twice.
create table private.student_rounds (
 student_id uuid not null references public.students(id) on delete cascade,
 file_name text not null,
 campaign text not null default '',
 queued_at timestamptz not null default clock_timestamp(),
 primary key(student_id,file_name,campaign)
);
alter table private.student_rounds enable row level security;
insert into private.student_rounds(student_id,file_name,campaign)
 select id,import_file,coalesce(call_campaign,'') from public.students where import_file is not null
 union select student_id,file_name,campaign from private.manual_calls where student_id is not null
 on conflict do nothing;

create function private.record_import_round() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.import_file is not null then
  insert into private.student_rounds(student_id,file_name,campaign) values(new.id,new.import_file,coalesce(new.call_campaign,'')) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger record_import_round after insert on public.students for each row execute function private.record_import_round();

create or replace function public.import_calling_leads(target_branch uuid,file_name text,lead_rows jsonb,assignment_mode text,caller_ids uuid[],source_name text,received_on date,consent text,campaign text,requeue boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare summary jsonb; result jsonb; out_rows jsonb:='[]'; item jsonb; phone text; s public.students; requeued int:=0; turn int:=0;
 round_file text:=import_calling_leads.file_name; round_label text:=coalesce(nullif(trim(import_calling_leads.campaign),''),'');
begin
 if length(round_label)>150 then raise exception 'Campaign too long'; end if;
 perform set_config('portal.import_file',round_file,true),set_config('portal.call_campaign',round_label,true);
 summary=public.bulk_import_leads(target_branch,round_file,lead_rows,assignment_mode,caller_ids,source_name,received_on,consent);
 if not coalesce(requeue,false) then return summary; end if;
 for result in select value from jsonb_array_elements(summary->'rows') loop
  if result->>'status'='duplicate' and result->>'reason'='Student Phone already registered.' then
   select value into item from jsonb_array_elements(lead_rows) where value->>'row_number'=result->>'row_number' limit 1;
   phone=public.normalize_phone(item->>'student_phone');
   select * into s from public.students where student_phone=phone and branch_id=target_branch for update;
   if s.id is null then
    result=result||jsonb_build_object('reason','Already registered in another branch · not queued.');
   elsif exists(select 1 from private.student_rounds r where r.student_id=s.id and r.file_name=round_file and r.campaign=round_label) then
    result=result||jsonb_build_object('reason','Already in this round · not queued again.');
   elsif s.calling_status<>'eligible' or s.pipeline_stage in ('Dropped','Closed','Admitted') then
    result=result||jsonb_build_object('reason',case when s.calling_status='do_not_contact' then 'Already in portal · Do not call, not queued.' when s.calling_status='held' then 'Already in portal · held, not queued.' else 'Already in portal · closed, not queued.' end);
   else
    update public.students set import_file=round_file,call_campaign=nullif(round_label,''),
     assigned_to=case when assignment_mode='unassigned' then assigned_to else caller_ids[1+(turn%cardinality(caller_ids))] end,
     next_call_at=clock_timestamp()
    where id=s.id;
    insert into private.student_rounds(student_id,file_name,campaign) values(s.id,round_file,round_label) on conflict do nothing;
    turn=turn+1;requeued=requeued+1;
    result=result||jsonb_build_object('status','requeued','reason','Already in portal · back in the queue for this round.');
   end if;
  end if;
  out_rows=out_rows||jsonb_build_array(result);
 end loop;
 return summary||jsonb_build_object('rows',out_rows,'requeued_count',requeued,'duplicate_count',(summary->>'duplicate_count')::int-requeued);
end $$;

-- A transferred student's pending Interested follow-up moves with them. The old branch loses it; the new branch manages it.
create function private.move_pending_followups() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.interested_followups set branch_id=new.branch_id where student_id=new.id and resolved_at is null;
 delete from private.caller_current_lead where student_id=new.id;
 return new;
end $$;
create trigger move_pending_followups after update of branch_id on public.students for each row
 when (old.branch_id is distinct from new.branch_id) execute function private.move_pending_followups();

-- Access follows the student's current branch.
create or replace function public.book_followup_visit(entry uuid, visit_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare f private.interested_followups; s public.students; actor public.staff_profiles:=private.current_staff();
begin
 select * into f from private.interested_followups where entry_id=entry and resolved_at is null for update;
 select * into s from public.students where id=f.student_id;
 if f.entry_id is null or s.id is null or actor.role is distinct from 'centre_head' and actor.role is distinct from 'owner' or not public.can_manage_branch(s.branch_id) then raise exception 'Access denied'; end if;
 if visit_at is null or visit_at<=now() then raise exception 'Choose a future visit time.'; end if;
 update public.appointments set status='cancelled' where student_id=s.id and status='scheduled';
 insert into public.appointments(student_id,branch_id,scheduled_at,status,created_by) values(s.id,s.branch_id,visit_at,'scheduled',actor.id);
end $$;

create or replace function public.dismiss_followup(entry uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.interested_followups f set resolved_at=clock_timestamp(),resolution='dismissed'
 from public.students s
 where f.entry_id=entry and f.resolved_at is null and s.id=f.student_id and public.can_manage_branch(s.branch_id) and public.my_role() in ('centre_head','owner');
 if not found then raise exception 'Access denied'; end if;
end $$;

revoke all on function private.record_import_round(),private.move_pending_followups() from public,anon,authenticated;
