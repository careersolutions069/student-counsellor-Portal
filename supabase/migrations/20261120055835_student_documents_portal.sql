alter table public.students add column allow_student_upload boolean not null default false;
create function private.guard_upload_permission() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' and public.my_role()='tele_counsellor' and new.allow_student_upload then
  if tg_op='INSERT' then raise exception 'Only centre management can allow document uploads'; end if;
  if new.allow_student_upload is distinct from old.allow_student_upload then raise exception 'Only centre management can allow document uploads'; end if;
 end if;
 if tg_op='UPDATE' and current_user='authenticated' and public.my_role()='tele_counsellor' and new.allow_student_upload is distinct from old.allow_student_upload then raise exception 'Only centre management can allow document uploads'; end if;
 return new;
end $$;
create trigger guard_upload_permission before insert or update on public.students for each row execute function private.guard_upload_permission();

create table public.student_documents (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id) on delete cascade,
 branch_id uuid not null references public.branches(id),
 document_name text not null check(length(trim(document_name)) between 1 and 150),
 status text not null default 'Pending' check(status in ('Pending','Uploaded','Verified','Re-upload Needed')),
 file_path text, file_name text,
 uploaded_by_role text check(uploaded_by_role in ('student','centre_head','owner')),
 remarks text check(length(remarks)<=2000), updated_at timestamptz not null default clock_timestamp(),
 unique(student_id,document_name),
 foreign key(student_id,branch_id) references public.students(id,branch_id) on update cascade on delete cascade,
 check((file_path is null and file_name is null and uploaded_by_role is null) or (file_path is not null and file_name is not null and uploaded_by_role is not null)),
 check(status not in ('Uploaded','Verified') or file_path is not null),
 check(file_path is null or file_path ~ ('^'||student_id::text||'/'||id::text||'/[0-9a-f-]+\.(pdf|jpg|jpeg|png)$'))
);
create index student_documents_student_idx on public.student_documents(student_id);
create index student_documents_branch_idx on public.student_documents(branch_id);
alter table public.student_documents enable row level security;
revoke all on public.student_documents from anon,authenticated;
grant select,insert,update on public.student_documents to authenticated;
grant all on public.student_documents to service_role;
create policy documents_read on public.student_documents for select to authenticated using(public.can_manage_branch(branch_id));
create policy documents_insert on public.student_documents for insert to authenticated with check(public.can_manage_branch(branch_id));
create policy documents_update on public.student_documents for update to authenticated using(public.can_manage_branch(branch_id)) with check(public.can_manage_branch(branch_id));
create function private.guard_document() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' then
  if tg_op='INSERT' then
   if new.file_path is not null or new.file_name is not null or new.uploaded_by_role is not null then raise exception 'Use the document upload action'; end if;
  elsif new.id<>old.id or new.student_id<>old.student_id or new.file_path is distinct from old.file_path or new.file_name is distinct from old.file_name or new.uploaded_by_role is distinct from old.uploaded_by_role then raise exception 'Document identity and files are server managed'; end if;
 end if;
 new.updated_at=clock_timestamp();
 return new;
end $$;
create trigger guard_document before insert or update on public.student_documents for each row execute function private.guard_document();
create trigger audit_documents after insert or update or delete on public.student_documents for each row execute function private.audit_change();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('student-documents','student-documents',false,5242880,array['application/pdf','image/jpeg','image/png']);
-- A restrictive policy also blocks this bucket if another bucket later gets broad policies.
create policy student_documents_server_only on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'student-documents') with check(bucket_id<>'student-documents');

create function public.document_access(document_id uuid,staff_actor uuid default null,target_student uuid default null,session_hash text default null,for_upload boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.student_documents; s public.students; actor public.staff_profiles; active_branch boolean;
begin
 select * into d from public.student_documents where id=document_id;
 if d.id is null then raise exception 'Document unavailable'; end if;
 select * into s from public.students where id=d.student_id;
 select is_active into active_branch from public.branches where id=s.branch_id;
 if staff_actor is not null then
  select * into actor from public.staff_profiles where id=staff_actor and is_active;
  if actor.id is null or not (actor.role='owner' or (actor.role='centre_head' and actor.branch_id=s.branch_id and active_branch)) then raise exception 'Access denied'; end if;
 else
  if target_student is distinct from s.id or not s.is_profile_complete or not active_branch or not exists(select 1 from private.student_sessions x where x.token_hash=session_hash and x.student_id=s.id and x.expires_at>now()) then raise exception 'Access denied'; end if;
  if for_upload and (not s.allow_student_upload or d.status='Verified') then raise exception 'Student uploads are disabled or this document is verified'; end if;
 end if;
 return to_jsonb(d);
end $$;

create function public.finalize_document_upload(document_id uuid,new_path text,new_name text,new_status text,expected_updated_at timestamptz,staff_actor uuid default null,target_student uuid default null,session_hash text default null) returns text language plpgsql security definer set search_path='' as $$
declare d public.student_documents; s_id uuid; actor public.staff_profiles; old_path text; role_name text;
begin
 if staff_actor is not null then
  select * into actor from public.staff_profiles where id=staff_actor and is_active for share;
  if actor.id is null then raise exception 'Access denied'; end if;
 end if;
 select student_id into s_id from public.student_documents where id=document_id;
 perform 1 from public.students where id=s_id for share;
 -- Serialize transfers, upload toggles and concurrent file/status changes before rechecking access.
 select * into d from public.student_documents where id=document_id for update;
 perform public.document_access(document_id,staff_actor,target_student,session_hash,true);
 if d.updated_at is distinct from expected_updated_at then raise exception 'Document changed; refresh and try again'; end if;
 if new_path is null or new_name is null or length(new_name) not between 1 and 180 then raise exception 'File details required'; end if;
 if staff_actor is null then role_name='student';new_status='Uploaded';else role_name=actor.role; end if;
 if new_status not in ('Uploaded','Verified') or new_status is null then raise exception 'Invalid upload status'; end if;
 old_path=d.file_path;
 update public.student_documents set file_path=new_path,file_name=new_name,uploaded_by_role=role_name,status=new_status,remarks=null where id=document_id;
 insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
 values(staff_actor,role_name,d.branch_id,'upload','student_documents',d.id,jsonb_build_object('student_id',s_id,'file_name',new_name,'status',new_status));
 return old_path;
end $$;
revoke execute on function public.document_access(uuid,uuid,uuid,text,boolean),public.finalize_document_upload(uuid,text,text,text,timestamptz,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.document_access(uuid,uuid,uuid,text,boolean),public.finalize_document_upload(uuid,text,text,text,timestamptz,uuid,uuid,text) to service_role;

create or replace function public.student_portal(target uuid,session_hash text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'id',s.id,'full_name',s.full_name,'registration_number',s.registration_number,'student_phone',s.student_phone,'dob',s.dob,'pipeline_stage',s.pipeline_stage,
  'target_course',s.target_course,'allow_student_upload',s.allow_student_upload,
  'branch',jsonb_build_object('name',b.name,'address',b.address,'google_maps_url',b.google_maps_url),
  'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'scheduled_at',a.scheduled_at,'status',a.status) order by a.scheduled_at) from public.appointments a where a.student_id=s.id and a.status='scheduled' and a.scheduled_at>=now()),'[]'::jsonb),
  'shortlists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'college_name',c.college_name,'course_name',c.course_name,'fees_estimate',c.fees_estimate,'document_status',c.document_status,'admission_status',c.admission_status)) from public.shortlists_and_admissions c where c.student_id=s.id and c.is_shared),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'document_name',d.document_name,'status',d.status,'file_name',d.file_name,'has_file',d.file_path is not null,'remarks',d.remarks,'updated_at',d.updated_at) order by d.document_name,d.id) from public.student_documents d where d.student_id=s.id),'[]'::jsonb)
 ) from public.students s join public.branches b on b.id=s.branch_id and b.is_active
 where s.id=target and s.is_profile_complete and exists(select 1 from private.student_sessions x where x.token_hash=session_hash and x.student_id=s.id and x.expires_at>now())
$$;
