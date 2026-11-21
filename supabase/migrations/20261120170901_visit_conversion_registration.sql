create extension if not exists pgcrypto with schema extensions;
alter table public.students
 add column "F/N" text,
 add column city text,
 add column state text,
 add column counselling_amount numeric(12,2) check(counselling_amount>0),
 add column marks_type text check(marks_type in ('exact','approximate')),
 add column selected_courses text[] not null default '{}' check(selected_courses<@array['MBBS','BDS','BAMS']::text[] and cardinality(selected_courses)<=3),
 add column college_type text check(college_type in ('government','private')),
 add column college_pdf_path text,
 add column college_pdf_name text,
 add column visit_details_completed boolean not null default false,
 add constraint visit_details_required check(not visit_details_completed or coalesce(
  length(trim("F/N"))>0 and length(trim(city))>0 and length(trim(state))>0 and counselling_amount>0
  and length(trim(percentage_or_score))>0 and marks_type is not null and cardinality(selected_courses)>0
  and college_type is not null and college_pdf_path is not null and college_pdf_name is not null,false));
update storage.buckets set file_size_limit=10485760 where id='student-documents';

-- RLS controls rows; column grants keep fee and college files out of caller queries.
revoke select,insert,update on public.students from authenticated;
do $$declare safe_columns text; writable_columns text;
begin
 select string_agg(quote_ident(attname),',' order by attnum) into safe_columns from pg_attribute where attrelid='public.students'::regclass and attnum>0 and not attisdropped and attname not in ('counselling_amount','college_pdf_path','college_pdf_name');
 select string_agg(quote_ident(attname),',' order by attnum) into writable_columns from pg_attribute where attrelid='public.students'::regclass and attnum>0 and not attisdropped and attname not in ('counselling_amount','college_pdf_path','college_pdf_name','visit_details_completed','college_type','marks_type','selected_courses','F/N');
 execute 'grant select('||safe_columns||') on public.students to authenticated';
 execute 'grant insert('||writable_columns||'),update('||writable_columns||') on public.students to authenticated';
 execute 'create view public.caller_student_records with(security_invoker=true) as select '||safe_columns||' from public.students';
end$$;
revoke all on public.caller_student_records from public,anon,authenticated;
grant select on public.caller_student_records to authenticated;
create function public.managed_students() returns setof public.students language sql stable security definer set search_path='' as $$
 select s.* from public.students s where public.can_manage_branch(s.branch_id)
$$;
revoke execute on function public.managed_students() from public,anon;
grant execute on function public.managed_students() to authenticated;

create function public.save_visit_details(target uuid,details jsonb,expected_branch uuid,expected_pdf_path text,expected_college_type text,new_pdf_path text default null,new_pdf_name text default null) returns text language plpgsql security definer set search_path='' as $$
declare s public.students; courses text[]; amount numeric; path text; filename text;
begin
 select * into s from public.students where id=target for update;
 if s.id is null or not public.can_manage_branch(s.branch_id) then raise exception 'Access denied'; end if;
 if s.branch_id is distinct from expected_branch or s.college_pdf_path is distinct from expected_pdf_path or s.college_type is distinct from expected_college_type then raise exception 'Visit changed; refresh before saving'; end if;
 if jsonb_typeof(details) is distinct from 'object' then raise exception 'Visit details required'; end if;
 if exists(select 1 from unnest(array['full_name','F/N','city','state','percentage_or_score']) f where coalesce(length(trim(details->>f)),0) not between 1 and 150) then raise exception 'Name, F/N, city, state and marks are required'; end if;
 if details->>'counselling_amount' is null or details->>'counselling_amount' !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Positive amount with up to two decimals required'; end if;
 amount=(details->>'counselling_amount')::numeric;
 if amount<=0 or amount>9999999999.99 then raise exception 'Positive amount within range required'; end if;
 if coalesce(details->>'marks_type','') not in ('exact','approximate') or coalesce(details->>'college_type','') not in ('government','private') then raise exception 'Marks type and college type required'; end if;
 if jsonb_typeof(details->'selected_courses') is distinct from 'array' then raise exception 'Select one or more courses'; end if;
 courses=array(select jsonb_array_elements_text(details->'selected_courses'));
 if cardinality(courses) not between 1 and 3 or not courses<@array['MBBS','BDS','BAMS']::text[] or cardinality(courses)<>(select count(distinct c) from unnest(courses) c) then raise exception 'Select distinct MBBS, BDS or BAMS courses'; end if;
 if new_pdf_path is null then
  if s.college_pdf_path is null or s.college_type is distinct from details->>'college_type' then raise exception 'Upload a new PDF for the selected college type'; end if;
  path=s.college_pdf_path;filename=s.college_pdf_name;
 else
  if new_pdf_path is not distinct from s.college_pdf_path or new_pdf_path !~ ('^'||s.branch_id::text||'/'||s.id::text||'/college-registration/[0-9a-f-]+\.pdf$') or coalesce(length(new_pdf_name),0) not between 1 and 180 then raise exception 'Invalid college PDF'; end if;
  path=new_pdf_path;filename=new_pdf_name;
 end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='student-documents' and o.name=path and o.metadata->>'mimetype'='application/pdf' and (o.metadata->>'size')::bigint between 1 and 10485760) then raise exception 'Uploaded PDF unavailable'; end if;
 update public.students set full_name=trim(details->>'full_name'),"F/N"=trim(details->>'F/N'),student_phone=public.normalize_phone(details->>'student_phone'),city=trim(details->>'city'),state=trim(details->>'state'),counselling_amount=amount,percentage_or_score=trim(details->>'percentage_or_score'),marks_type=details->>'marks_type',selected_courses=courses,target_course=array_to_string(courses,', '),college_type=details->>'college_type',college_pdf_path=path,college_pdf_name=filename,visit_details_completed=true where id=target;
 return case when new_pdf_path is not null then s.college_pdf_path else null end;
end$$;
revoke execute on function public.save_visit_details(uuid,jsonb,uuid,text,text,text,text) from public,anon;
grant execute on function public.save_visit_details(uuid,jsonb,uuid,text,text,text,text) to authenticated;

create or replace function public.complete_student_profile(target uuid,student_name text,phone text,birth_date date) returns text language plpgsql security definer set search_path='' as $$
declare s public.students; code text; yr integer:=extract(year from timezone('Asia/Kolkata',now())); alphabet constant text:='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; suffix text; candidate text; bytes bytea; violated text; i integer;
begin
 select * into s from public.students where id=target for update;
 if s.id is null or not public.can_manage_branch(s.branch_id) then raise exception 'Access denied'; end if;
 phone=public.normalize_phone(phone);
 if student_name is null or length(trim(student_name)) not between 1 and 150 or phone is null or birth_date is null or birth_date>current_date then raise exception 'Name, 10-digit phone and valid DOB required'; end if;
 if s.registration_number is null then
  if not s.visit_details_completed then raise exception 'Save visit details before generating registration'; end if;
  select b.code into code from public.branches b where b.id=s.branch_id for share;
  loop
   bytes=extensions.gen_random_bytes(6);suffix='';
   for i in 0..5 loop suffix=suffix||substr(alphabet,get_byte(bytes,i)%length(alphabet)+1,1);end loop;
   if suffix !~ '[A-Z]' or suffix !~ '[2-9]' then continue; end if;
   candidate='CS-'||code||'-'||yr||'-'||suffix;
   if exists(select 1 from public.students where upper(registration_number)=candidate) then continue; end if;
   begin
    update public.students set full_name=trim(student_name),student_phone=phone,dob=birth_date,registration_number=candidate,is_profile_complete=true where id=target;
    exit;
   exception when unique_violation then
    get stacked diagnostics violated=constraint_name;
    if violated not in ('students_registration_number_key','students_registration_case_insensitive') then raise; end if;
   end;
  end loop;
  s.registration_number=candidate;
 else
  update public.students set full_name=trim(student_name),student_phone=phone,dob=birth_date,is_profile_complete=true where id=target;
 end if;
 delete from private.student_sessions where student_id=target;
 return s.registration_number;
end$$;

create or replace function public.counsellor_queue(queue_name text, page_number integer default 1) returns jsonb language sql stable set search_path='' as $$
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
  from public.caller_student_records s
  left join lateral(select * from public.appointments where student_id=s.id order by created_at desc,id desc limit 1) a on true
  left join lateral(select id,next_callback_at from public.call_logs where student_id=s.id order by created_at desc,id desc limit 1) c on true
  where public.my_role()='tele_counsellor' and s.branch_id=public.my_branch() and s.assigned_to=auth.uid()
 ), page as (
  select * from leads where queue=queue_name order by coalesce(callback_at,(latest_appointment->>'scheduled_at')::timestamptz,created_at),id limit 25 offset (greatest(1,least(page_number,1000000))-1)*25
 )
 select jsonb_build_object('students',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),'total',(select count(*) from leads where queue=queue_name),'counts',jsonb_build_object('to_call',(select count(*) from leads where queue='to_call'),'invited',(select count(*) from leads where queue='invited'),'missed',(select count(*) from leads where queue='missed')));
$$;
create or replace function public.record_counsellor_action(target uuid,education jsonb,action_type text,request_id uuid default null,visit_at timestamptz default null,callback_at timestamptz default null,call_remarks text default null,reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
 update public.students set full_name=trim(education->>'full_name'),parent_phone=public.normalize_phone(education->>'parent_phone'),academic_stream=education->>'academic_stream',percentage_or_score=education->>'percentage_or_score',target_course=education->>'target_course',preferred_locations=education->>'preferred_locations',budget_range=education->>'budget_range',city=case when education ? 'city' then education->>'city' else city end,state=case when education ? 'state' then education->>'state' else state end where id=target returning * into s;
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
create or replace function public.student_login(reg text, birth_date date, ip_hash text, session_hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare reg_key text:='reg:'||upper(trim(reg)); ip_key text:='ip:'||ip_hash; s public.students;
begin
 if upper(trim(reg)) !~ '^CS-[A-Z0-9]+-[0-9]{4}-[A-Z0-9]{4,8}$' or reg is null then return jsonb_build_object('error','Registration number or date of birth is incorrect.'); end if;
 -- Sorted locks serialize attempts across both shared registration numbers and shared IPs.
 perform pg_advisory_xact_lock(hashtextextended(least(reg_key,ip_key),0));
 perform pg_advisory_xact_lock(hashtextextended(greatest(reg_key,ip_key),0));
 delete from private.student_sessions where expires_at<now();
 insert into private.login_attempts(key) values(reg_key),(ip_key) on conflict do nothing;
 update private.login_attempts set failures=0,window_start=now() where key in(reg_key,ip_key) and window_start<=now()-interval '15 minutes';
 if exists(select 1 from private.login_attempts where key in(reg_key,ip_key) and failures>=5) then return jsonb_build_object('error','Too many attempts. Try again in 15 minutes.'); end if;
 select * into s from public.students where upper(registration_number)=upper(trim(reg)) and dob=birth_date and is_profile_complete and exists(select 1 from public.branches b where b.id=branch_id and b.is_active) for share;
 if s.id is null then
  update private.login_attempts set failures=failures+1 where key in(reg_key,ip_key);
  return jsonb_build_object('error','Registration number or date of birth is incorrect.');
 end if;
 insert into private.student_sessions values(session_hash,s.id,now()+interval '8 hours');
 return jsonb_build_object('student_id',s.id);
end $$;

-- Historical branch audit readers must not retain fee or college file metadata after transfer.
create or replace function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; event_branch uuid; actor public.staff_profiles; private_changed boolean:=false;
begin
 if tg_op<>'INSERT' then before_row=to_jsonb(old); end if;
 if tg_op<>'DELETE' then after_row=to_jsonb(new); end if;
 if tg_table_name='students' then
  private_changed=(before_row->'counselling_amount',before_row->'college_pdf_path',before_row->'college_pdf_name') is distinct from (after_row->'counselling_amount',after_row->'college_pdf_path',after_row->'college_pdf_name');
  before_row=before_row-array['counselling_amount','college_pdf_path','college_pdf_name'];
  after_row=after_row-array['counselling_amount','college_pdf_path','college_pdf_name'];
 end if;
 row_data=coalesce(after_row,before_row);
 select * into actor from public.staff_profiles where id=auth.uid();
 event_branch=case when tg_table_name='branches' then case when tg_op='DELETE' then null else (row_data->>'id')::uuid end when tg_table_name='branch_transfers' then (row_data->>'to_branch_id')::uuid else (row_data->>'branch_id')::uuid end;
 insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
 values(actor.id,coalesce(actor.role,'system'),event_branch,lower(tg_op),tg_table_name,(row_data->>'id')::uuid,jsonb_build_object('before',before_row,'after',after_row,'private_visit_details_changed',private_changed));
 if tg_op='UPDATE' and before_row->>'branch_id' is distinct from after_row->>'branch_id' and before_row->>'branch_id' is not null then
  insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
  values(actor.id,coalesce(actor.role,'system'),(before_row->>'branch_id')::uuid,'update',tg_table_name,(row_data->>'id')::uuid,jsonb_build_object('before',before_row,'after',after_row,'private_visit_details_changed',private_changed));
 end if;
 return coalesce(new,old);
end $$;


create function public.branch_student_counts() returns table(branch_id uuid,total bigint) language sql stable set search_path='' as $$
 select s.branch_id,count(s.id) from public.students s where public.can_manage_branch(s.branch_id) group by s.branch_id
$$;
revoke execute on function public.branch_student_counts() from public,anon;
grant execute on function public.branch_student_counts() to authenticated;
