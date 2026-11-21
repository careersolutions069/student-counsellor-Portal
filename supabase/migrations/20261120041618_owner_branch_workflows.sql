alter table public.students
 add column target_course text,
 add column academic_stream text,
 add column percentage_or_score text,
 add column preferred_locations text,
 add column budget_range text,
 add column drop_reason text;
alter table public.branches add constraint branches_three_letter_code check (code ~ '^[A-Z]{3}$') not valid;
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check check(status in ('scheduled','attended','completed','cancelled','missed'));
create index students_parent_phone_idx on public.students(parent_phone);

create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.staff_profiles(id),
 actor_role text not null, branch_id uuid references public.branches(id), action text not null,
 entity_type text not null, entity_id uuid not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.branch_transfers (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id),
 from_branch_id uuid not null references public.branches(id), to_branch_id uuid not null references public.branches(id),
 reason text not null check(length(trim(reason))>0), transferred_by uuid not null references public.staff_profiles(id),
 created_at timestamptz not null default now(), check(from_branch_id<>to_branch_id)
);
create index audit_logs_branch_created_idx on public.audit_logs(branch_id,created_at desc);
create index branch_transfers_from_idx on public.branch_transfers(from_branch_id,created_at desc);
create index branch_transfers_to_idx on public.branch_transfers(to_branch_id,created_at desc);
create index branch_transfers_student_idx on public.branch_transfers(student_id);
alter table public.audit_logs enable row level security;
alter table public.branch_transfers enable row level security;
revoke all on public.audit_logs,public.branch_transfers from anon,authenticated;
grant select on public.audit_logs,public.branch_transfers to authenticated;
grant insert on public.branch_transfers to authenticated;
create policy audit_read on public.audit_logs for select to authenticated using (
 public.my_role()='owner' or (public.my_role()='centre_head' and branch_id=public.my_branch())
);
create policy transfer_read on public.branch_transfers for select to authenticated using (
 public.my_role()='owner' or (public.my_role()='centre_head' and public.my_branch() in (from_branch_id,to_branch_id))
);
create policy transfer_insert on public.branch_transfers for insert to authenticated with check(public.my_role()='owner' and transferred_by=auth.uid());

create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; event_branch uuid; actor public.staff_profiles;
begin
 if tg_op<>'INSERT' then before_row=to_jsonb(old); end if;
 if tg_op<>'DELETE' then after_row=to_jsonb(new); end if;
 row_data=coalesce(after_row,before_row);
 select * into actor from public.staff_profiles where id=auth.uid();
 event_branch=case when tg_table_name='branches' then (row_data->>'id')::uuid when tg_table_name='branch_transfers' then (row_data->>'to_branch_id')::uuid else (row_data->>'branch_id')::uuid end;
 insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
 values(actor.id,coalesce(actor.role,'system'),event_branch,lower(tg_op),tg_table_name,(row_data->>'id')::uuid,jsonb_build_object('before',before_row,'after',after_row));
 if tg_op='UPDATE' and before_row->>'branch_id' is distinct from after_row->>'branch_id' and before_row->>'branch_id' is not null then
  insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
  values(actor.id,coalesce(actor.role,'system'),(before_row->>'branch_id')::uuid,'update',tg_table_name,(row_data->>'id')::uuid,jsonb_build_object('before',before_row,'after',after_row));
 end if;
 return coalesce(new,old);
end $$;
create trigger audit_branches after insert or update or delete on public.branches for each row execute function private.audit_change();
create trigger audit_staff after insert or update or delete on public.staff_profiles for each row execute function private.audit_change();
create trigger audit_students after insert or update or delete on public.students for each row execute function private.audit_change();
create trigger audit_calls after insert or update or delete on public.call_logs for each row execute function private.audit_change();
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function private.audit_change();
create trigger audit_shortlists after insert or update or delete on public.shortlists_and_admissions for each row execute function private.audit_change();
create trigger audit_transfers after insert on public.branch_transfers for each row execute function private.audit_change();

create function public.normalize_phone(value text) returns text language plpgsql immutable set search_path='' as $$
declare digits text:=regexp_replace(value,'[^0-9]','','g');
begin
 if value is not null and value !~ '^[+0-9[:space:]().-]*$' then raise exception 'Enter a valid 10-digit Indian phone number'; end if;
 if digits is null or digits='' then return null; end if;
 if length(digits)=12 and left(digits,2)='91' then digits=substr(digits,3); end if;
 if length(digits)=11 and left(digits,1)='0' then digits=substr(digits,2); end if;
 if digits !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit Indian phone number'; end if;
 return digits;
end $$;
create function private.validate_student_contacts() returns trigger language plpgsql security definer set search_path='' as $$
declare contact text;
begin
 new.student_phone=public.normalize_phone(new.student_phone);
 new.parent_phone=public.normalize_phone(new.parent_phone);
 if new.assigned_to is not null then
  perform 1 from public.staff_profiles p where p.id=new.assigned_to and p.branch_id=new.branch_id and p.role='tele_counsellor'
   and (p.is_active or (tg_op='UPDATE' and new.assigned_to is not distinct from old.assigned_to and new.branch_id=old.branch_id)) for share;
  if not found then raise exception 'Assignee must be a tele-counsellor in this branch'; end if;
 end if;
 if tg_op='UPDATE' and new.student_phone is not distinct from old.student_phone and new.parent_phone is not distinct from old.parent_phone then return new; end if;
 for contact in select distinct x from unnest(array[new.student_phone,new.parent_phone]) x where x is not null order by x loop
  perform pg_advisory_xact_lock(hashtextextended('student-contact:'||contact,0));
 end loop;
 if exists(select 1 from public.students s where s.id<>new.id and (s.student_phone in(new.student_phone,new.parent_phone) or s.parent_phone in(new.student_phone,new.parent_phone))) then
  raise exception 'A student or parent phone number is already registered' using errcode='23505';
 end if;
 return new;
end $$;
-- Runs before the existing identity and branch guard.
create trigger a_validate_student_contacts before insert or update on public.students for each row execute function private.validate_student_contacts();

alter policy staff_insert on public.staff_profiles with check (
 public.my_role()='owner' or (public.my_role()='centre_head' and role='tele_counsellor' and branch_id=public.my_branch())
);
create function public.update_staff(target uuid, staff_name text, staff_role text, destination uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.staff_profiles; actor public.staff_profiles;
begin
 actor=private.current_staff();
 select * into p from public.staff_profiles where id=target for update;
 if p.id is null or p.role='owner' or actor.id is null then raise exception 'Access denied'; end if;
 if staff_name is null or length(trim(staff_name))=0 or staff_role not in ('centre_head','tele_counsellor') or staff_role is null then raise exception 'Invalid staff profile'; end if;
 if actor.role<>'owner' and not (actor.role='centre_head' and p.role='tele_counsellor' and p.branch_id=actor.branch_id and destination=actor.branch_id and staff_role='tele_counsellor') then raise exception 'Access denied'; end if;
 if destination is null or not exists(select 1 from public.branches where id=destination and (is_active or id=p.branch_id)) then raise exception 'Active branch required'; end if;
 if p.branch_id<>destination or staff_role<>'tele_counsellor' then
  update public.students set assigned_to=null where assigned_to=target;
 end if;
 update public.staff_profiles set full_name=trim(staff_name),role=staff_role,branch_id=destination where id=target;
end $$;

create function public.transfer_student(target uuid,destination uuid,transfer_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.students;
begin
 if public.my_role() is distinct from 'owner' then raise exception 'Access denied'; end if;
 if transfer_reason is null or length(trim(transfer_reason))=0 then raise exception 'Transfer reason is required'; end if;
 perform 1 from public.branches where id=destination and is_active for share;
 if not found then raise exception 'Active destination branch required'; end if;
 select * into s from public.students where id=target for update;
 if s.id is null then raise exception 'Student not found'; end if;
 if s.branch_id=destination then raise exception 'Choose a different destination branch'; end if;
 update public.students set branch_id=destination,assigned_to=null where id=target;
 update public.call_logs set branch_id=destination where student_id=target;
 update public.appointments set branch_id=destination where student_id=target;
 update public.shortlists_and_admissions set branch_id=destination where student_id=target;
 delete from private.student_sessions where student_id=target;
 insert into public.branch_transfers(student_id,from_branch_id,to_branch_id,reason,transferred_by)
 values(target,s.branch_id,destination,trim(transfer_reason),auth.uid());
end $$;
-- Preserve existing two-argument callers while the portal collects an explicit reason.
create or replace function public.transfer_student(target uuid,destination uuid) returns void language sql set search_path='' as $$
 select public.transfer_student(target,destination,'Branch transfer');
$$;
create function public.dashboard_kpis(selected_branch uuid default null) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'total_leads',(select count(*) from public.students s where selected_branch is null or s.branch_id=selected_branch),
  'f2f_attended',(select count(distinct a.student_id) from public.appointments a where a.status in ('attended','completed') and (selected_branch is null or a.branch_id=selected_branch)),
  'profiles_completed',(select count(*) from public.students s where s.is_profile_complete and (selected_branch is null or s.branch_id=selected_branch)),
  'admissions_confirmed',(select count(*) from public.students s where (selected_branch is null or s.branch_id=selected_branch) and (s.pipeline_stage='Admitted' or exists(select 1 from public.shortlists_and_admissions c where c.student_id=s.id and lower(trim(c.admission_status)) in ('confirmed','admitted','admission confirmed'))))
 );
$$;
revoke execute on function public.normalize_phone(text),public.update_staff(uuid,text,text,uuid),public.transfer_student(uuid,uuid,text),public.dashboard_kpis(uuid) from public,anon;
grant execute on function public.normalize_phone(text),public.update_staff(uuid,text,text,uuid),public.transfer_student(uuid,uuid,text),public.dashboard_kpis(uuid) to authenticated;

create index audit_logs_actor_idx on public.audit_logs(actor_id);
create index branch_transfers_actor_idx on public.branch_transfers(transferred_by);

create or replace function public.complete_student_profile(target uuid, student_name text, phone text, birth_date date) returns text language plpgsql security definer set search_path = '' as $$
declare s public.students; code text; yr integer:=extract(year from timezone('Asia/Kolkata',now())); seq integer; used_seq integer;
begin
 select * into s from public.students where id=target for update;
 if s.id is null or not public.can_manage_branch(s.branch_id) then raise exception 'Access denied'; end if;
 phone=public.normalize_phone(phone);
 if student_name is null or length(trim(student_name))=0 or phone is null or birth_date is null or birth_date>current_date then raise exception 'Name, 10-digit phone and valid DOB required'; end if;
 if not s.is_profile_complete then
  select b.code into code from public.branches b where b.id=s.branch_id for share;
  perform pg_advisory_xact_lock(hashtextextended('registration:'||code||':'||yr,0));
  select coalesce(max(right(registration_number,4)::int),0) into used_seq from public.students where registration_number ~ ('^CS-'||code||'-'||yr||'-[0-9]{4}$');
  insert into private.registration_counters values(s.branch_id,yr,1) on conflict(branch_id,year) do update set sequence=private.registration_counters.sequence+1 returning sequence into seq;
  seq=greatest(seq,used_seq+1);
  if seq>9999 then raise exception 'Annual registration capacity reached'; end if;
  update private.registration_counters set sequence=seq where branch_id=s.branch_id and year=yr;
  s.registration_number:='CS-'||code||'-'||yr||'-'||lpad(seq::text,4,'0');
 end if;
 update public.students set full_name=trim(student_name),student_phone=phone,dob=birth_date,registration_number=s.registration_number,is_profile_complete=true where id=target;
 delete from private.student_sessions where student_id=target;
 return s.registration_number;
end $$;
