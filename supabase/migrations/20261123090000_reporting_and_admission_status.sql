-- Reporting and admission-status consistency.
-- 1. Attendance = a student with at least one Attended/legacy Completed appointment.
--    Saved visit details are reported separately as Visit Details Completed.
-- 2. Owner reports keep inactive branches and their historical students.
-- 3. Shortlist admission status becomes a controlled list; legacy values are normalized,
--    and unrecognized originals are preserved for staff review.

-- ---------------------------------------------------------------------------
-- 3. Controlled admission statuses
-- ---------------------------------------------------------------------------
alter table public.shortlists_and_admissions add column legacy_admission_status text;

create function private.normalize_admission_status(value text) returns text language sql immutable set search_path='' as $$
 select case lower(regexp_replace(btrim(coalesce(value,'')),'\s+',' ','g'))
  when '' then 'Pending'
  when 'pending' then 'Pending'
  when 'applied' then 'Applied'
  when 'application submitted' then 'Applied'
  when 'confirmed' then 'Admission Confirmed'
  when 'admitted' then 'Admission Confirmed'
  when 'admission confirmed' then 'Admission Confirmed'
  when 'not admitted' then 'Not Admitted'
  when 'withdrawn' then 'Withdrawn'
  else null
 end
$$;

-- Backfill before the guard exists. Recognized values map to canonical statuses.
-- Anything else keeps its original text in legacy_admission_status and has no status
-- until staff choose one, so it can never count as a confirmed admission.
update public.shortlists_and_admissions
 set legacy_admission_status=case when private.normalize_admission_status(admission_status) is null then admission_status end,
     admission_status=private.normalize_admission_status(admission_status);

alter table public.shortlists_and_admissions alter column admission_status set default 'Pending';
alter table public.shortlists_and_admissions add constraint shortlist_admission_status_valid check (
 -- coalesce: a NULL status must fail, not pass, unless a legacy value is preserved for review.
 coalesce(admission_status in ('Pending','Applied','Admission Confirmed','Not Admitted','Withdrawn'),false)
 or (admission_status is null and legacy_admission_status is not null)
);

create function private.guard_admission_status() returns trigger language plpgsql set search_path='' as $$
begin
 -- legacy_admission_status is written only by migrations. Choosing a valid status resolves the review.
 if tg_op='INSERT' or new.admission_status is not null then new.legacy_admission_status:=null;
 else new.legacy_admission_status:=old.legacy_admission_status; end if;
 return new;
end $$;
create trigger a_guard_admission_status before insert or update on public.shortlists_and_admissions for each row execute function private.guard_admission_status();

-- ---------------------------------------------------------------------------
-- 1. Dashboard KPIs: attended students and visit details are separate metrics
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_kpis(selected_branch uuid default null) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'total_leads',(select count(*) from public.students s where selected_branch is null or s.branch_id=selected_branch),
  'f2f_attended',(select count(*) from public.students s where (selected_branch is null or s.branch_id=selected_branch) and exists(select 1 from public.appointments a where a.student_id=s.id and a.status in ('attended','completed'))),
  'visit_details_completed',(select count(*) from public.students s where s.visit_details_completed and (selected_branch is null or s.branch_id=selected_branch)),
  'profiles_completed',(select count(*) from public.students s where s.is_profile_complete and (selected_branch is null or s.branch_id=selected_branch)),
  'admissions_confirmed',(select count(*) from public.students s where (selected_branch is null or s.branch_id=selected_branch) and (s.pipeline_stage='Admitted' or exists(select 1 from public.shortlists_and_admissions c where c.student_id=s.id and c.admission_status='Admission Confirmed')))
 );
$$;

-- ---------------------------------------------------------------------------
-- 1 + 2. Owner report: separate metrics and inactive-branch history
-- ---------------------------------------------------------------------------
create or replace function public.owner_conversion_report(selected_branch uuid default null,start_at timestamptz default null,end_at timestamptz default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.staff_profiles where id=auth.uid() and role='owner' and is_active) then raise exception 'Owner access required';end if;
 if start_at is not null and end_at is not null and start_at>=end_at then raise exception 'Invalid date range';end if;
 if selected_branch is not null and not exists(select 1 from public.branches where id=selected_branch) then raise exception 'Invalid branch';end if;
 with branches as materialized(select id,name,code,is_active from public.branches where selected_branch is null or id=selected_branch),
 leads as materialized(
  select s.id,s.branch_id,s.assigned_to,s.registration_number,s.counselling_amount,c.allotted_phase,c.student_id is not null as in_counselling,
   exists(select 1 from public.appointments a where a.student_id=s.id) as invited,
   exists(select 1 from public.appointments a where a.student_id=s.id and a.status in ('attended','completed')) as attended,
   s.visit_details_completed as visit_details
  from public.students s join branches b on b.id=s.branch_id left join public.student_counselling c on c.student_id=s.id
  where (start_at is null or s.created_at>=start_at) and (end_at is null or s.created_at<end_at)
 ),
 branch_rows as materialized(
  select b.id as branch_id,b.name,b.code,b.is_active,count(s.id) as enquiries,count(s.id) filter(where s.invited) as invited,count(s.id) filter(where s.attended) as attended,count(s.id) filter(where s.visit_details) as visit_details,count(s.id) filter(where s.registration_number is not null) as registered,count(s.id) filter(where s.allotted_phase is not null) as allotted,coalesce(sum(s.counselling_amount),0) as amount
  from branches b left join leads s on s.branch_id=b.id group by b.id,b.name,b.code,b.is_active
 ),
 caller_assigned as(select assigned_to,count(*) as total from leads where assigned_to is not null group by assigned_to),
 caller_calls as(select c.logged_by,count(*) as total from public.call_logs c join leads s on s.id=c.student_id group by c.logged_by),
 caller_invites as(select a.created_by,count(distinct s.id) as invites,count(distinct s.id) filter(where a.status in ('attended','completed')) as attended from public.appointments a join leads s on s.id=a.student_id group by a.created_by),
 caller_rows as(
  select p.id,p.full_name as name,b.name as branch,p.is_active,coalesce(a.total,0) as assigned,coalesce(c.total,0) as calls,coalesce(i.invites,0) as invites,coalesce(i.attended,0) as attended
  from public.staff_profiles p join branches b on b.id=p.branch_id left join caller_assigned a on a.assigned_to=p.id left join caller_calls c on c.logged_by=p.id left join caller_invites i on i.created_by=p.id where p.role='tele_counsellor'
 ),
 doc_counts as(select count(distinct d.student_id) filter(where d.doc_category='new_choice_pdf') as new_choices,count(distinct d.student_id) filter(where d.doc_category='new_allotment_letter') as new_allotments,count(distinct d.student_id) filter(where d.doc_category='upgrade_choice_pdf') as upgrade_choices,count(distinct d.student_id) filter(where d.doc_category='upgraded_allotment_letter') as upgrade_allotments from public.counselling_documents d join leads s on s.id=d.student_id)
 select jsonb_build_object(
 'branches',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('amount',r.amount::text) order by r.is_active desc,r.name,r.branch_id) from branch_rows r),'[]'),
 'total',(select jsonb_build_object('branch_id',null,'name','All-India Total','code','ALL','is_active',true,'enquiries',coalesce(sum(enquiries),0),'invited',coalesce(sum(invited),0),'attended',coalesce(sum(attended),0),'visit_details',coalesce(sum(visit_details),0),'registered',coalesce(sum(registered),0),'allotted',coalesce(sum(allotted),0),'amount',coalesce(sum(amount),0)::text) from branch_rows),
 'callers',coalesce((select jsonb_agg(to_jsonb(r) order by r.branch,r.name,r.id) from caller_rows r),'[]'),
 'phases',(select jsonb_agg((select count(*) from leads where allotted_phase=phase) order by phase) from generate_series(1,6) phase),
 'in_counselling',(select count(*) from leads where in_counselling and allotted_phase is null),
 'new_choices',new_choices,'new_allotments',new_allotments,'upgrade_choices',upgrade_choices,'upgrade_allotments',upgrade_allotments) into result from doc_counts;
 return result;
end$$;
