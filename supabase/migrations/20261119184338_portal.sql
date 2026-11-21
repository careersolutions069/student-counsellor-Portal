create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table public.branches (
 id uuid primary key default gen_random_uuid(), name text not null, code text not null unique check (code ~ '^[A-Z]{2,8}$'),
 city text not null, address text not null, google_maps_url text check (google_maps_url is null or google_maps_url ~ '^https://(www\.)?(google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl)(/|\?|$)'),
 is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.staff_profiles (
 id uuid primary key references auth.users(id), full_name text not null, email text not null unique,
 role text not null check (role in ('owner','centre_head','tele_counsellor')),
 branch_id uuid references public.branches(id), is_active boolean not null default true, created_at timestamptz not null default now(),
 check ((role = 'owner' and branch_id is null) or (role <> 'owner' and branch_id is not null))
);
create table public.students (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id), assigned_to uuid references public.staff_profiles(id),
 full_name text not null check (length(trim(full_name)) > 0), student_phone text not null unique check (student_phone ~ '^[0-9]{10}$'),
 parent_phone text check (parent_phone is null or parent_phone ~ '^[0-9]{10}$'), dob date,
 registration_number text unique, is_profile_complete boolean not null default false, lead_source text,
 pipeline_stage text not null default 'New Enquiry', created_at timestamptz not null default now(), unique(id,branch_id),
 check (not is_profile_complete or (dob is not null and registration_number is not null))
);
create unique index students_registration_case_insensitive on public.students (upper(registration_number));
create table public.call_logs (
 id uuid primary key default gen_random_uuid(), student_id uuid not null, branch_id uuid not null references public.branches(id),
 logged_by uuid not null references public.staff_profiles(id), outcome text not null, remarks text, next_callback_at timestamptz, created_at timestamptz not null default now(),
 foreign key(student_id,branch_id) references public.students(id,branch_id) deferrable initially deferred
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(), student_id uuid not null, branch_id uuid not null references public.branches(id), scheduled_at timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled','missed')), created_by uuid not null references public.staff_profiles(id), created_at timestamptz not null default now(),
 foreign key(student_id,branch_id) references public.students(id,branch_id) deferrable initially deferred
);
create table public.shortlists_and_admissions (
 id uuid primary key default gen_random_uuid(), student_id uuid not null, branch_id uuid not null references public.branches(id), college_name text not null,
 course_name text not null, fees_estimate text, document_status text, admission_status text, is_shared boolean not null default false, updated_at timestamptz not null default now(),
 foreign key(student_id,branch_id) references public.students(id,branch_id) deferrable initially deferred
);
create table private.registration_counters (branch_id uuid references public.branches(id), year integer, sequence integer not null, primary key(branch_id,year));
create table private.login_attempts (key text primary key, failures integer not null default 0, window_start timestamptz not null default now());
create table private.student_sessions (token_hash text primary key, student_id uuid not null references public.students(id), expires_at timestamptz not null);

create index on public.staff_profiles(branch_id);
create index on public.students(branch_id);
create index on public.students(assigned_to);
create index on public.call_logs(branch_id,student_id);
create index on public.appointments(branch_id,student_id,scheduled_at);
create index on public.shortlists_and_admissions(branch_id,student_id);

create function private.current_staff() returns public.staff_profiles language sql stable security definer set search_path = '' as $$
 select p from public.staff_profiles p where p.id = auth.uid() and p.is_active and (p.role = 'owner' or exists(select 1 from public.branches b where b.id=p.branch_id and b.is_active))
$$;
create function public.my_role() returns text language sql stable security definer set search_path = '' as $$ select (private.current_staff()).role $$;
create function public.my_branch() returns uuid language sql stable security definer set search_path = '' as $$ select (private.current_staff()).branch_id $$;
create function public.can_manage_branch(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(public.my_role()='owner' or (public.my_role()='centre_head' and public.my_branch()=target),false)
$$;
create function public.can_access_student(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.students s where s.id=target and (public.can_manage_branch(s.branch_id) or (public.my_role()='tele_counsellor' and s.branch_id=public.my_branch() and s.assigned_to=auth.uid())))
$$;

alter table public.branches enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.students enable row level security;
alter table public.call_logs enable row level security;
alter table public.appointments enable row level security;
alter table public.shortlists_and_admissions enable row level security;
alter table private.registration_counters enable row level security;
alter table private.login_attempts enable row level security;
alter table private.student_sessions enable row level security;
revoke all on all tables in schema public from anon;
revoke all on all tables in schema private from anon, authenticated;
grant select,insert,update,delete on public.branches,public.staff_profiles,public.students,public.call_logs,public.appointments,public.shortlists_and_admissions to authenticated;

create policy branches_read on public.branches for select to authenticated using (public.my_role()='owner' or id=public.my_branch());
create policy branches_write on public.branches for all to authenticated using (public.my_role()='owner') with check(public.my_role()='owner');
create policy staff_read on public.staff_profiles for select to authenticated using (public.my_role()='owner' or (public.my_role()='centre_head' and branch_id=public.my_branch()) or (id=auth.uid() and public.my_role() is not null));
create policy staff_insert on public.staff_profiles for insert to authenticated with check (public.my_role()='owner' or (public.my_role()='centre_head' and role='tele_counsellor' and branch_id=public.my_branch()));
create policy staff_update on public.staff_profiles for update to authenticated using (public.my_role()='owner' or (public.my_role()='centre_head' and role='tele_counsellor' and branch_id=public.my_branch())) with check(public.my_role()='owner' or (public.my_role()='centre_head' and role='tele_counsellor' and branch_id=public.my_branch()));
create policy students_read on public.students for select to authenticated using (public.can_manage_branch(branch_id) or (public.my_role()='tele_counsellor' and branch_id=public.my_branch() and assigned_to=auth.uid()));
create policy students_insert on public.students for insert to authenticated with check(public.can_manage_branch(branch_id));
create policy students_update on public.students for update to authenticated using (public.can_manage_branch(branch_id) or (public.my_role()='tele_counsellor' and branch_id=public.my_branch() and assigned_to=auth.uid())) with check(public.can_manage_branch(branch_id) or (public.my_role()='tele_counsellor' and branch_id=public.my_branch() and assigned_to=auth.uid()));
create policy students_delete on public.students for delete to authenticated using(public.can_manage_branch(branch_id));
create policy calls_staff on public.call_logs for all to authenticated using(public.can_access_student(student_id)) with check(public.can_access_student(student_id) and logged_by=auth.uid());
create policy appointments_staff on public.appointments for all to authenticated using(public.can_access_student(student_id)) with check(public.can_access_student(student_id) and (public.can_manage_branch(branch_id) or created_by=auth.uid()));
create policy shortlists_staff on public.shortlists_and_admissions for all to authenticated using(public.can_access_student(student_id)) with check(public.can_access_student(student_id));

create function private.guard_student() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.assigned_to is not null and not exists(select 1 from public.staff_profiles p where p.id=new.assigned_to and p.branch_id=new.branch_id and p.role='tele_counsellor' and (p.is_active or (tg_op='UPDATE' and new.assigned_to is not distinct from old.assigned_to))) then raise exception 'Assignee must be a tele-counsellor in this branch'; end if;
 if tg_op='UPDATE' and current_user in ('authenticated','anon') then
  if new.branch_id is distinct from old.branch_id then raise exception 'Use the owner transfer action'; end if;
  if new.registration_number is distinct from old.registration_number or new.is_profile_complete is distinct from old.is_profile_complete then raise exception 'Use profile completion'; end if;
  if public.my_role()='tele_counsellor' and (new.assigned_to is distinct from old.assigned_to or new.dob is distinct from old.dob) then raise exception 'Caller cannot change assignment or DOB'; end if;
 end if;
 if tg_op='INSERT' and current_user='authenticated' and (new.registration_number is not null or new.is_profile_complete) then raise exception 'Use profile completion'; end if;
 return new;
end $$;
create trigger guard_student before insert or update on public.students for each row execute function private.guard_student();
create function private.guard_staff() returns trigger language plpgsql set search_path = '' as $$
begin
 if current_user='authenticated' and (new.id is distinct from old.id or new.role is distinct from old.role or new.branch_id is distinct from old.branch_id or new.email is distinct from old.email) then raise exception 'Staff identity, branch and role are immutable'; end if;
 if old.role='owner' and new.is_active=false then raise exception 'Owner account cannot be deactivated here'; end if;
 return new;
end $$;
create trigger guard_staff before update on public.staff_profiles for each row execute function private.guard_staff();
create function private.touch_shortlist() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create trigger touch_shortlist before update on public.shortlists_and_admissions for each row execute function private.touch_shortlist();

create function public.complete_student_profile(target uuid, student_name text, phone text, birth_date date) returns text language plpgsql security definer set search_path = '' as $$
declare s public.students; code text; yr integer:=extract(year from timezone('Asia/Kolkata',now())); seq integer;
begin
 select * into s from public.students where id=target for update;
 if s.id is null or not public.can_manage_branch(s.branch_id) then raise exception 'Access denied'; end if;
 if length(trim(student_name))=0 or phone !~ '^[0-9]{10}$' or birth_date is null or birth_date>current_date then raise exception 'Name, 10-digit phone and valid DOB required'; end if;
 if not s.is_profile_complete then
  select b.code into code from public.branches b where b.id=s.branch_id;
  insert into private.registration_counters values(s.branch_id,yr,1) on conflict(branch_id,year) do update set sequence=private.registration_counters.sequence+1 returning sequence into seq;
  if seq>9999 then raise exception 'Annual registration capacity reached'; end if;
  s.registration_number:='CS-'||code||'-'||yr||'-'||lpad(seq::text,4,'0');
 end if;
 update public.students set full_name=trim(student_name),student_phone=phone,dob=birth_date,registration_number=s.registration_number,is_profile_complete=true where id=target;
 delete from private.student_sessions where student_id=target;
 return s.registration_number;
end $$;
create function public.transfer_student(target uuid, destination uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 if public.my_role() is distinct from 'owner' then raise exception 'Access denied'; end if;
 if not exists(select 1 from public.branches where id=destination and is_active) then raise exception 'Active destination branch required'; end if;
 perform 1 from public.students where id=target for update;
 if not found then raise exception 'Student not found'; end if;
 update public.students set branch_id=destination,assigned_to=null where id=target;
 update public.call_logs set branch_id=destination where student_id=target;
 update public.appointments set branch_id=destination where student_id=target;
 update public.shortlists_and_admissions set branch_id=destination where student_id=target;
 delete from private.student_sessions where student_id=target;
end $$;

create function public.student_login(reg text, birth_date date, ip_hash text, session_hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare reg_key text:='reg:'||upper(trim(reg)); ip_key text:='ip:'||ip_hash; s public.students;
begin
 -- Sorted locks serialize attempts across both shared registration numbers and shared IPs.
 perform pg_advisory_xact_lock(hashtextextended(least(reg_key,ip_key),0));
 perform pg_advisory_xact_lock(hashtextextended(greatest(reg_key,ip_key),0));
 delete from private.student_sessions where expires_at<now();
 insert into private.login_attempts(key) values(reg_key),(ip_key) on conflict do nothing;
 update private.login_attempts set failures=0,window_start=now() where key in(reg_key,ip_key) and window_start<=now()-interval '15 minutes';
 if exists(select 1 from private.login_attempts where key in(reg_key,ip_key) and failures>=5) then return jsonb_build_object('error','Too many attempts. Try again in 15 minutes.'); end if;
 select * into s from public.students where upper(registration_number)=upper(trim(reg)) and dob=birth_date and is_profile_complete and exists(select 1 from public.branches b where b.id=branch_id and b.is_active);
 if s.id is null then
  update private.login_attempts set failures=failures+1 where key in(reg_key,ip_key);
  return jsonb_build_object('error','Registration number or date of birth is incorrect.');
 end if;
 insert into private.student_sessions values(session_hash,s.id,now()+interval '8 hours');
 return jsonb_build_object('student_id',s.id);
end $$;
create function public.student_portal(target uuid, session_hash text) returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'id',s.id,'full_name',s.full_name,'registration_number',s.registration_number,'student_phone',s.student_phone,'dob',s.dob,'pipeline_stage',s.pipeline_stage,
  'branch',jsonb_build_object('name',b.name,'address',b.address,'google_maps_url',b.google_maps_url),
  'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'scheduled_at',a.scheduled_at,'status',a.status) order by a.scheduled_at) from public.appointments a where a.student_id=s.id and a.status='scheduled' and a.scheduled_at>=now()),'[]'::jsonb),
  'shortlists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'college_name',c.college_name,'course_name',c.course_name,'fees_estimate',c.fees_estimate,'document_status',c.document_status,'admission_status',c.admission_status)) from public.shortlists_and_admissions c where c.student_id=s.id and c.is_shared),'[]'::jsonb)
 ) from public.students s join public.branches b on b.id=s.branch_id and b.is_active
 where s.id=target and s.is_profile_complete and exists(select 1 from private.student_sessions x where x.token_hash=session_hash and x.student_id=s.id and x.expires_at>now())
$$;
create function public.student_logout(session_hash text) returns void language sql security definer set search_path = '' as $$ delete from private.student_sessions where token_hash=session_hash $$;

revoke execute on all functions in schema public from public,anon;
grant execute on function public.my_role(),public.my_branch(),public.can_manage_branch(uuid),public.can_access_student(uuid),public.complete_student_profile(uuid,text,text,date),public.transfer_student(uuid,uuid) to authenticated;
grant execute on function public.student_login(text,date,text,text),public.student_portal(uuid,text),public.student_logout(text) to service_role;
