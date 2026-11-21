create function private.valid_counselling_states(states text[]) returns boolean language sql immutable set search_path='' as $$
 select states is not null and cardinality(states)<=5 and array_position(states,null) is null and cardinality(states)=(select count(distinct s) from unnest(states) s)
 and states<@array['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry']::text[]
$$;
create table public.student_counselling (
 id uuid primary key default gen_random_uuid(),student_id uuid unique not null references public.students(id) on delete cascade,
 branch_id uuid not null references public.branches(id),preferred_states text[] not null default '{}' check(private.valid_counselling_states(preferred_states)),
 current_phase int not null default 1 check(current_phase between 1 and 6),allotted_phase int check(allotted_phase between 1 and 6),
 finished boolean not null default false,updated_at timestamptz not null default clock_timestamp(),
 foreign key(student_id,branch_id) references public.students(id,branch_id) on update cascade on delete cascade,
 check(allotted_phase is null or (allotted_phase=current_phase and finished)),check(not finished or allotted_phase is not null or current_phase=6)
);
create table public.counselling_documents (
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students(id) on delete cascade,
 branch_id uuid not null references public.branches(id),doc_category text not null check(doc_category in ('security_deposit','stage_doc_1_3','stage_doc_4_5','stage_doc_6','choice_pdf','allotment_letter','new_choice_pdf','new_allotment_letter','upgrade_choice_pdf','upgraded_allotment_letter')),
 phase_number int check(phase_number between 1 and 6),label text not null check(length(trim(label)) between 1 and 200),
 file_path text not null,file_name text not null check(length(file_name) between 1 and 180),
 reused_from_doc_id uuid references public.counselling_documents(id) on delete set null,show_to_student boolean not null default false,
 uploaded_by uuid references public.staff_profiles(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(student_id,branch_id) references public.students(id,branch_id) on update cascade on delete cascade,
 check((doc_category in ('choice_pdf','allotment_letter'))=(phase_number is not null)),
 check(file_path ~ ('^[0-9a-f-]{36}/'||student_id::text||'/counselling/[0-9a-f-]{36}\.pdf$'))
);
create unique index counselling_document_slot on public.counselling_documents(student_id,doc_category,coalesce(phase_number,0));
create index counselling_state_branch on public.student_counselling(branch_id);
create index counselling_docs_branch on public.counselling_documents(branch_id);
create index counselling_docs_reused on public.counselling_documents(reused_from_doc_id);
create index counselling_docs_path on public.counselling_documents(file_path);
alter table public.student_counselling enable row level security;
alter table public.counselling_documents enable row level security;
revoke all on public.student_counselling,public.counselling_documents from anon,authenticated;
grant select on public.student_counselling,public.counselling_documents to authenticated;
grant update(show_to_student) on public.counselling_documents to authenticated;
grant all on public.student_counselling,public.counselling_documents to service_role;
create policy counselling_state_scope on public.student_counselling for all to authenticated using(public.can_manage_branch(branch_id)) with check(public.can_manage_branch(branch_id));
create policy counselling_docs_scope on public.counselling_documents for all to authenticated using(public.can_manage_branch(branch_id)) with check(public.can_manage_branch(branch_id));
create trigger audit_counselling_state after insert or update or delete on public.student_counselling for each row execute function private.audit_change();
create trigger audit_counselling_docs after insert or update or delete on public.counselling_documents for each row execute function private.audit_change();
create function private.lock_counselling_student(target uuid,actor_id uuid) returns public.students language plpgsql security definer set search_path='' as $$
declare s public.students;p public.staff_profiles;
begin
 select * into p from public.staff_profiles where id=actor_id and is_active for share;
 if p.id is null or p.role not in ('owner','centre_head') then raise exception 'Access denied';end if;
 select * into s from public.students where id=target for update;
 if s.id is null or not (p.role='owner' or (p.branch_id=s.branch_id and exists(select 1 from public.branches where id=s.branch_id and is_active))) then raise exception 'Access denied';end if;
 return s;
end$$;
revoke execute on function private.lock_counselling_student(uuid,uuid) from public,anon,authenticated;
create function private.ensure_counselling(s public.students) returns public.student_counselling language plpgsql security definer set search_path='' as $$
declare c public.student_counselling;
begin
 insert into public.student_counselling(student_id,branch_id) values(s.id,s.branch_id) on conflict(student_id) do nothing;
 select * into c from public.student_counselling where student_id=s.id for update;return c;
end$$;
revoke execute on function private.ensure_counselling(public.students) from public,anon,authenticated;
create function private.check_counselling_slot(target uuid,category text,phase int) returns void language plpgsql security definer set search_path='' as $$
declare c public.student_counselling;
begin
 select * into c from public.student_counselling where student_id=target;
 if category is null or category not in ('security_deposit','stage_doc_1_3','stage_doc_4_5','stage_doc_6','choice_pdf','allotment_letter','new_choice_pdf','new_allotment_letter','upgrade_choice_pdf','upgraded_allotment_letter') or (phase is not null and phase not between 1 and 6) or ((category in ('choice_pdf','allotment_letter'))<>(phase is not null)) then raise exception 'Invalid counselling slot';end if;
 if (category='choice_pdf' and phase>c.current_phase) or (category='allotment_letter' and phase is distinct from c.allotted_phase) or (category='stage_doc_4_5' and c.current_phase<4) or (category='stage_doc_6' and c.current_phase<6) then raise exception 'This phase is locked';end if;
 if category in ('new_choice_pdf','new_allotment_letter','upgrade_choice_pdf','upgraded_allotment_letter') and c.allotted_phase is null and not exists(select 1 from public.counselling_documents where student_id=target and doc_category='allotment_letter') then raise exception 'Allotment is required first';end if;
 if category in ('new_allotment_letter','upgraded_allotment_letter') and not exists(select 1 from public.counselling_documents where student_id=target and doc_category=case category when 'new_allotment_letter' then 'new_choice_pdf' else 'upgrade_choice_pdf' end) then raise exception 'Upload the corresponding choice PDF first';end if;
end$$;
revoke execute on function private.check_counselling_slot(uuid,text,int) from public,anon,authenticated;
create function public.save_counselling_states(target uuid,states text[]) returns void language plpgsql security definer set search_path='' as $$
declare s public.students;c public.student_counselling;
begin
 s=private.lock_counselling_student(target,auth.uid());c=private.ensure_counselling(s);
 if not private.valid_counselling_states(states) then raise exception 'Select up to 5 distinct Indian states';end if;
 update public.student_counselling set preferred_states=states,updated_at=clock_timestamp() where student_id=target;
end$$;
create function public.counselling_outcome(target uuid,expected_phase int,outcome text) returns void language plpgsql security definer set search_path='' as $$
declare s public.students;c public.student_counselling;
begin
 s=private.lock_counselling_student(target,auth.uid());c=private.ensure_counselling(s);
 if expected_phase is distinct from c.current_phase or c.finished or outcome is null or outcome not in ('not_allotted','allotted') then raise exception 'Phase changed or finished; refresh before continuing';end if;
 if not exists(select 1 from public.counselling_documents where student_id=target and doc_category='choice_pdf' and phase_number=c.current_phase) then raise exception 'Upload the required Choice PDF first';end if;
 update public.student_counselling set current_phase=case when outcome='not_allotted' then least(6,c.current_phase+1) else c.current_phase end,allotted_phase=case when outcome='allotted' then c.current_phase else null end,finished=(outcome='allotted' or c.current_phase=6),updated_at=clock_timestamp() where student_id=target;
end$$;
create function public.reuse_counselling_choice(target uuid,phase int,source_doc_id uuid,expected_id uuid default null,expected_created_at timestamptz default null) returns text language plpgsql security definer set search_path='' as $$
declare s public.students;c public.student_counselling;source public.counselling_documents;existing public.counselling_documents;old_path text;
begin
 s=private.lock_counselling_student(target,auth.uid());c=private.ensure_counselling(s);perform private.check_counselling_slot(target,'choice_pdf',phase);
 select * into source from public.counselling_documents where id=source_doc_id and student_id=target and doc_category='choice_pdf' and phase_number<phase;
 if source.id is null then raise exception 'Choose an earlier phase Choice PDF';end if;
 select * into existing from public.counselling_documents where student_id=target and doc_category='choice_pdf' and phase_number=phase;
 if existing.id is distinct from expected_id or existing.created_at is distinct from expected_created_at then raise exception 'Document changed; refresh before replacing';end if;
 old_path=existing.file_path;
 if existing.id is null then
  insert into public.counselling_documents(student_id,branch_id,doc_category,phase_number,label,file_path,file_name,reused_from_doc_id,uploaded_by) values(target,s.branch_id,'choice_pdf',phase,'Phase '||phase||' Choice of Colleges PDF',source.file_path,source.file_name,source.id,auth.uid());
 else
  update public.counselling_documents set file_path=source.file_path,file_name=source.file_name,reused_from_doc_id=source.id,show_to_student=false,uploaded_by=auth.uid(),created_at=clock_timestamp() where id=existing.id;
 end if;
 if old_path is not null and not exists(select 1 from public.counselling_documents where file_path=old_path) then return old_path;end if;
 return null;
end$$;
revoke execute on function public.save_counselling_states(uuid,text[]),public.counselling_outcome(uuid,int,text),public.reuse_counselling_choice(uuid,int,uuid,uuid,timestamptz) from public,anon;
grant execute on function public.save_counselling_states(uuid,text[]),public.counselling_outcome(uuid,int,text),public.reuse_counselling_choice(uuid,int,uuid,uuid,timestamptz) to authenticated;
create function public.finalize_counselling_upload(target uuid,staff_actor uuid,expected_branch uuid,category text,phase int,new_path text,new_name text,doc_label text,expected_id uuid default null,expected_created_at timestamptz default null) returns text language plpgsql security definer set search_path='' as $$
declare s public.students;c public.student_counselling;d public.counselling_documents;actor_role text;old_path text;
begin
 s=private.lock_counselling_student(target,staff_actor);
 if s.branch_id is distinct from expected_branch then raise exception 'Student branch changed; refresh before uploading';end if;
 c=private.ensure_counselling(s);perform private.check_counselling_slot(target,category,phase);
 select * into d from public.counselling_documents where student_id=target and doc_category=category and phase_number is not distinct from phase;
 if d.id is distinct from expected_id or d.created_at is distinct from expected_created_at then raise exception 'Document changed; refresh before replacing';end if;
 if new_path is null or new_path !~ ('^'||s.branch_id::text||'/'||s.id::text||'/counselling/[0-9a-f-]{36}\.pdf$') or not exists(select 1 from storage.objects where bucket_id='student-documents' and name=new_path and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint between 1 and 4194304) then raise exception 'Uploaded PDF unavailable';end if;
 old_path=d.file_path;
 if d.id is null then
  insert into public.counselling_documents(student_id,branch_id,doc_category,phase_number,label,file_path,file_name,uploaded_by) values(target,s.branch_id,category,phase,doc_label,new_path,new_name,staff_actor) returning * into d;
 else
  update public.counselling_documents set label=doc_label,file_path=new_path,file_name=new_name,uploaded_by=staff_actor,reused_from_doc_id=null,show_to_student=false,created_at=clock_timestamp() where id=d.id returning * into d;
 end if;
 select role into actor_role from public.staff_profiles where id=staff_actor;
 insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details) values(staff_actor,actor_role,s.branch_id,'upload','counselling_documents',d.id,jsonb_build_object('student_id',target,'doc_category',category,'phase_number',phase,'file_name',new_name,'show_to_student',false));
 -- Only the server can attach new paths; authenticated reuse can reference current slots only.
 if old_path is not null and not exists(select 1 from public.counselling_documents where file_path=old_path) then return old_path;end if;
 return null;
end$$;
create function public.counselling_document_access(document_id uuid,staff_actor uuid default null,target_student uuid default null,session_hash text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.counselling_documents;p public.staff_profiles;s public.students;active_branch boolean;
begin
 select * into d from public.counselling_documents where id=document_id;if d.id is null then raise exception 'Document unavailable';end if;
 select * into s from public.students where id=d.student_id;select is_active into active_branch from public.branches where id=s.branch_id;
 if staff_actor is not null then
  select * into p from public.staff_profiles where id=staff_actor and is_active;
  if p.id is null or not (p.role='owner' or (p.role='centre_head' and p.branch_id=s.branch_id and active_branch)) then raise exception 'Access denied';end if;
 else
  if not d.show_to_student or target_student is distinct from s.id or not s.is_profile_complete or not active_branch or not exists(select 1 from private.student_sessions where token_hash=session_hash and student_id=s.id and expires_at>now()) then raise exception 'Access denied';end if;
 end if;
 return jsonb_build_object('file_path',d.file_path,'file_name',d.file_name);
end$$;
revoke execute on function public.finalize_counselling_upload(uuid,uuid,uuid,text,int,text,text,text,uuid,timestamptz),public.counselling_document_access(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_counselling_upload(uuid,uuid,uuid,text,int,text,text,text,uuid,timestamptz),public.counselling_document_access(uuid,uuid,uuid,text) to service_role;

create or replace function public.student_portal(target uuid,session_hash text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'id',s.id,'full_name',s.full_name,'registration_number',s.registration_number,'student_phone',s.student_phone,'dob',s.dob,'pipeline_stage',s.pipeline_stage,
  'target_course',s.target_course,'allow_student_upload',s.allow_student_upload,
  'branch',jsonb_build_object('name',b.name,'address',b.address,'google_maps_url',b.google_maps_url),
  'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'scheduled_at',a.scheduled_at,'status',a.status) order by a.scheduled_at) from public.appointments a where a.student_id=s.id and a.status='scheduled' and a.scheduled_at>=now()),'[]'::jsonb),
  'shortlists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'college_name',c.college_name,'course_name',c.course_name,'fees_estimate',c.fees_estimate,'document_status',c.document_status,'admission_status',c.admission_status)) from public.shortlists_and_admissions c where c.student_id=s.id and c.is_shared),'[]'::jsonb),
  'counselling_documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'label',d.label,'file_name',d.file_name) order by d.created_at,d.id) from public.counselling_documents d where d.student_id=s.id and d.show_to_student),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'document_name',d.document_name,'status',d.status,'file_name',d.file_name,'has_file',d.file_path is not null,'remarks',d.remarks,'updated_at',d.updated_at) order by d.document_name,d.id) from public.student_documents d where d.student_id=s.id),'[]'::jsonb)
 ) from public.students s join public.branches b on b.id=s.branch_id and b.is_active
 where s.id=target and s.is_profile_complete and exists(select 1 from private.student_sessions x where x.token_hash=session_hash and x.student_id=s.id and x.expires_at>now())
$$;
