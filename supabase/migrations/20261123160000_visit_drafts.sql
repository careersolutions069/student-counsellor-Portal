-- Incomplete input stays separate from the verified student record and its reporting metrics.
create table public.student_visit_drafts (
 student_id uuid primary key references public.students(id) on delete cascade,
 version uuid not null,
 fields jsonb not null default '{}'
);
alter table public.student_visit_drafts enable row level security;
revoke all on public.student_visit_drafts from public, anon, authenticated;
grant select on public.student_visit_drafts to authenticated;
create policy managers_read_visit_drafts on public.student_visit_drafts for select to authenticated
 using (exists (select 1 from public.students s where s.id=student_id and public.can_manage_branch(s.branch_id)));

create function public.save_visit_draft(target uuid, expected_branch uuid, expected_version uuid, next_version uuid, draft jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare branch uuid; current_draft public.student_visit_drafts;
begin
 select branch_id into branch from public.students where id=target for update;
 if branch is null or branch is distinct from expected_branch or not public.can_manage_branch(branch) then raise exception 'Student unavailable'; end if;
 if jsonb_typeof(draft) is distinct from 'object' or length(draft::text)>8192 or next_version is null or next_version is not distinct from expected_version then raise exception 'Invalid draft'; end if;
 if exists(select 1 from jsonb_each(draft) e where case
   when key='selected_courses' then jsonb_typeof(value)<>'array' or not (value <@ '["MBBS","BDS","BAMS"]'::jsonb)
   when key in ('full_name','F/N','student_phone','city','state','percentage_or_score','counselling_amount','marks_type','college_type')
     then jsonb_typeof(value)<>'string' or length(value#>>'{}')>150
   else true end) then raise exception 'Invalid visit field'; end if;
 select * into current_draft from public.student_visit_drafts where student_id=target;
 if current_draft.version=next_version and current_draft.fields=draft then return; end if;
 if current_draft.version is distinct from expected_version then raise exception 'Visit draft changed. Reopen the record before editing.' using errcode='40001'; end if;
 insert into public.student_visit_drafts values(target,next_version,draft)
 on conflict(student_id) do update set version=excluded.version,fields=excluded.fields;
 insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
 values(auth.uid(),public.my_role(),branch,'update','student_visit_drafts',target,'{}');
end $$;
revoke all on function public.save_visit_draft(uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_visit_draft(uuid,uuid,uuid,uuid,jsonb) to authenticated;

-- Clear the draft in the same transaction as any successful visit completion.
-- Retain a version so an outstanding autosave cannot resurrect the old draft.
create function private.finish_visit_draft() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.visit_details_completed then
  insert into public.student_visit_drafts values(new.id,gen_random_uuid(),'{}')
  on conflict(student_id) do update set version=excluded.version,fields='{}';
 end if;
 return new;
end $$;
create trigger finish_visit_draft after update of visit_details_completed on public.students
 for each row execute function private.finish_visit_draft();

create function public.finalize_visit_draft(target uuid, details jsonb, expected_branch uuid, expected_pdf_path text,
 expected_college_type text, new_pdf_path text, new_pdf_name text, expected_version uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_path text;
begin
 perform 1 from public.students where id=target and branch_id=expected_branch and public.can_manage_branch(branch_id) for update;
 if not found then raise exception 'Student unavailable'; end if;
 if (select version from public.student_visit_drafts where student_id=target) is distinct from expected_version then
  raise exception 'Visit draft changed. Reopen the record before saving.' using errcode='40001';
 end if;
 old_path=public.save_visit_details(target,details,expected_branch,expected_pdf_path,expected_college_type,new_pdf_path,new_pdf_name);
 return (select jsonb_build_object('version',version,'old_path',old_path) from public.student_visit_drafts where student_id=target);
end $$;
revoke all on function public.finalize_visit_draft(uuid,jsonb,uuid,text,text,text,text,uuid) from public,anon;
grant execute on function public.finalize_visit_draft(uuid,jsonb,uuid,text,text,text,text,uuid) to authenticated;
