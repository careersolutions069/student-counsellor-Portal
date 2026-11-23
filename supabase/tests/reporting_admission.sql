begin;
create function pg_temp.check_ok(value boolean,message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$begin begin execute statement;exception when others then return;end;raise exception 'FAILED: permitted %',statement;end$$;
create function pg_temp.branch_row(report jsonb,branch uuid) returns jsonb language sql as $$select value from jsonb_array_elements(report->'branches') where value->>'branch_id'=branch::text$$;

-- Fixtures: Patna = students 1 and 2, Bangalore = students 3 and 4 (seed data).
-- Student 2: saved visit details only, no appointment.
update public.students set "F/N"='Fixture parent',city='Patna',state='Bihar',counselling_amount=1000,percentage_or_score='610',marks_type='exact',selected_courses=array['MBBS'],college_type='government',college_pdf_path=branch_id::text||'/'||id::text||'/college-registration/test.pdf',college_pdf_name='test.pdf',visit_details_completed=true where id='30000000-0000-4000-8000-000000000002';
-- Student 1: two attended appointments (one legacy Completed) plus the seeded scheduled visit.
insert into public.appointments(student_id,branch_id,created_by,scheduled_at,status) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004',now()-interval '3 days','attended'),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004',now()-interval '2 days','completed');
-- Student 3: one attended appointment in Bangalore.
update public.appointments set status='attended' where student_id='30000000-0000-4000-8000-000000000003';
-- Enquiry dates: student 1 falls just before the IST day that starts at 2026-01-31T18:30Z, student 3 exactly on it.
update public.students set created_at=case id when '30000000-0000-4000-8000-000000000001' then '2026-01-31T18:29:59Z'::timestamptz when '30000000-0000-4000-8000-000000000003' then '2026-01-31T18:30:00Z'::timestamptz else created_at end;

-- Owner: attendance and visit details are separate; dashboard and report agree.
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
do $$declare r jsonb;k jsonb;b jsonb;begin
 r=public.owner_conversion_report();
 perform pg_temp.check_ok((r->'total'->>'enquiries')::int=4 and (r->'total'->>'invited')::int=2,'All-time enquiry and invite totals');
 perform pg_temp.check_ok((r->'total'->>'attended')::int=2,'Two attended appointments for one student count once; visit details alone do not count');
 perform pg_temp.check_ok((r->'total'->>'visit_details')::int=1,'Visit details counted separately');
 b=pg_temp.branch_row(r,'10000000-0000-4000-8000-000000000001');
 perform pg_temp.check_ok((b->>'attended')::int=1 and (b->>'visit_details')::int=1 and (b->>'enquiries')::int=2,'Patna: one attended student, one visit-details student');
 perform pg_temp.check_ok((pg_temp.branch_row(r,'10000000-0000-4000-8000-000000000002')->>'attended')::int=1 and (pg_temp.branch_row(r,'10000000-0000-4000-8000-000000000002')->>'visit_details')::int=0,'Bangalore: attendance without visit details');
 -- Dashboard KPIs match the report for the same branch scope (all-time).
 k=public.dashboard_kpis();
 perform pg_temp.check_ok((k->>'f2f_attended')::int=(r->'total'->>'attended')::int and (k->>'visit_details_completed')::int=(r->'total'->>'visit_details')::int and (k->>'total_leads')::int=(r->'total'->>'enquiries')::int,'Dashboard matches report for all branches');
 k=public.dashboard_kpis('10000000-0000-4000-8000-000000000001');
 perform pg_temp.check_ok((k->>'f2f_attended')::int=(b->>'attended')::int and (k->>'visit_details_completed')::int=(b->>'visit_details')::int,'Dashboard matches report for Patna');
 -- Date scope still selects students by enquiry date in IST.
 r=public.owner_conversion_report(null,'2026-01-31T18:30:00Z','2026-02-01T18:30:00Z');
 perform pg_temp.check_ok((r->'total'->>'enquiries')::int=1 and (r->'total'->>'attended')::int=1,'IST day boundary includes 18:30Z and excludes 18:29:59Z');
end$$;

-- Saving visit details alone does not raise attendance for a student with no attended appointment.
reset role;
update public.students set "F/N"='Fixture parent',city='Bangalore',state='Karnataka',counselling_amount=500,percentage_or_score='580',marks_type='exact',selected_courses=array['BDS'],college_type='private',college_pdf_path=branch_id::text||'/'||id::text||'/college-registration/test.pdf',college_pdf_name='test.pdf',visit_details_completed=true where id='30000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select pg_temp.check_ok((public.owner_conversion_report()->'total'->>'attended')::int=2 and (public.owner_conversion_report()->'total'->>'visit_details')::int=2 and (public.dashboard_kpis()->>'f2f_attended')::int=2,'Visit details for a non-attended student leave attendance unchanged');

-- Deactivating a branch keeps its history in reports and totals.
reset role;
update public.branches set is_active=false where id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
do $$declare r jsonb;b jsonb;begin
 r=public.owner_conversion_report();
 b=pg_temp.branch_row(r,'10000000-0000-4000-8000-000000000002');
 perform pg_temp.check_ok(jsonb_array_length(r->'branches')=2 and (b->>'is_active')::boolean=false,'Inactive branch stays in All Branches and is flagged');
 perform pg_temp.check_ok((r->'total'->>'enquiries')::int=4 and (r->'total'->>'attended')::int=2 and (b->>'enquiries')::int=2 and (b->>'attended')::int=1 and (b->>'visit_details')::int=1,'Historical totals unchanged after deactivation');
 perform pg_temp.check_ok(exists(select 1 from jsonb_array_elements(r->'callers') where value->>'id'='20000000-0000-4000-8000-000000000005'),'Inactive branch counsellors stay in history');
 r=public.owner_conversion_report('10000000-0000-4000-8000-000000000002');
 perform pg_temp.check_ok(jsonb_array_length(r->'branches')=1 and (r->'total'->>'enquiries')::int=2 and (r->'total'->>'attended')::int=1,'Owner can filter to an inactive branch');
 perform pg_temp.check_ok((public.dashboard_kpis('10000000-0000-4000-8000-000000000002')->>'f2f_attended')::int=1,'Dashboard still reports the inactive branch');
end$$;
-- Existing deactivation rules are unchanged: imports into an inactive branch are blocked.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select pg_temp.denied($q$select public.bulk_import_leads('10000000-0000-4000-8000-000000000002','test.csv','[{"full_name":"Blocked","student_phone":"9888800101"}]','unassigned')$q$);
-- Centre Heads and Tele-Counsellors still cannot read Owner reports; anonymous users neither.
select pg_temp.denied($q$select public.owner_conversion_report()$q$);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.denied($q$select public.owner_conversion_report()$q$);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select pg_temp.denied($q$select public.owner_conversion_report()$q$);
reset role;
set local role anon;
select pg_temp.denied($q$select public.owner_conversion_report()$q$);
reset role;
update public.branches set is_active=true where id='10000000-0000-4000-8000-000000000002';

-- Legacy normalization: recognized values map, unrecognized originals are preserved, blanks become Pending.
create temp table backfill_fixture(original text,expected text,admission_status text,legacy_admission_status text);
insert into backfill_fixture(original,expected) values
 ('Confirmed','Admission Confirmed'),(' admitted ','Admission Confirmed'),('Admission Confirmed','Admission Confirmed'),('ADMISSION   CONFIRMED','Admission Confirmed'),
 ('Application Submitted','Applied'),('applied','Applied'),('Pending','Pending'),('','Pending'),(null,'Pending'),('Not Admitted','Not Admitted'),('Withdrawn','Withdrawn'),
 ('Shortlisted',null),('Under review',null),('Not confirmed',null),('Admission Confirmed Pending',null),('Verbally confirmed',null);
update backfill_fixture set admission_status=original;
-- Same expression as the migration backfill.
update backfill_fixture set legacy_admission_status=case when private.normalize_admission_status(admission_status) is null then admission_status end,admission_status=private.normalize_admission_status(admission_status);
select pg_temp.check_ok((select count(*)=16 and bool_and(admission_status is not distinct from expected) from backfill_fixture),'Recognized legacy values normalize');
select pg_temp.check_ok((select bool_and((expected is null and legacy_admission_status=original and admission_status is null) or (expected is not null and legacy_admission_status is null)) from backfill_fixture),'Unknown values keep their original text and never become confirmed');

-- New writes: only canonical statuses are accepted.
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
insert into public.shortlists_and_admissions(student_id,branch_id,college_name,course_name,admission_status,is_shared)
 select '30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Status College '||status,'B.Sc',status,false from unnest(array['Pending','Applied','Admission Confirmed','Not Admitted','Withdrawn']) status;
insert into public.shortlists_and_admissions(student_id,branch_id,college_name,course_name,is_shared) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Default Status College','B.Sc',false);
select pg_temp.check_ok((select admission_status='Pending' from public.shortlists_and_admissions where college_name='Default Status College'),'Missing status defaults to Pending');
select pg_temp.denied($q$insert into public.shortlists_and_admissions(student_id,branch_id,college_name,course_name,admission_status) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Bad','B.Sc','Confirmed')$q$);
select pg_temp.denied($q$insert into public.shortlists_and_admissions(student_id,branch_id,college_name,course_name,admission_status) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Bad','B.Sc','admission confirmed')$q$);
select pg_temp.denied($q$insert into public.shortlists_and_admissions(student_id,branch_id,college_name,course_name,admission_status) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Bad','B.Sc','')$q$);
select pg_temp.denied($q$insert into public.shortlists_and_admissions(student_id,branch_id,college_name,course_name,admission_status) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Bad','B.Sc',null)$q$);
select pg_temp.denied($q$insert into public.shortlists_and_admissions(student_id,branch_id,college_name,course_name,admission_status,legacy_admission_status) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Bad','B.Sc',null,'Forged review')$q$);
select pg_temp.denied($q$update public.shortlists_and_admissions set admission_status='Shortlisted' where college_name='Default Status College'$q$);
select pg_temp.denied($q$update public.shortlists_and_admissions set admission_status=null where college_name='Default Status College'$q$);
select pg_temp.denied($q$select private.normalize_admission_status('Confirmed')$q$);
-- Internal shortlist with a confirmed status stays staff-only.
update public.shortlists_and_admissions set is_shared=false where college_name='Status College Admission Confirmed';

-- KPI uses canonical confirmed status once per student and keeps the Admitted-stage rule.
reset role;
select pg_temp.check_ok((public.dashboard_kpis()->>'admissions_confirmed')::int=1,'Confirmed shortlist counts once even with duplicates and other statuses');
update public.students set pipeline_stage='Admitted' where id='30000000-0000-4000-8000-000000000002';
select pg_temp.check_ok((public.dashboard_kpis()->>'admissions_confirmed')::int=2,'Admitted pipeline stage still counts as confirmed');
update public.students set pipeline_stage='New Enquiry' where id='30000000-0000-4000-8000-000000000002';

-- A legacy row awaiting review (written as migrations do, with the guard bypassed) is never confirmed.
set constraints all immediate;
alter table public.shortlists_and_admissions disable trigger a_guard_admission_status;
insert into public.shortlists_and_admissions(student_id,branch_id,college_name,course_name,admission_status,legacy_admission_status,is_shared) values('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Review College','B.Sc',null,'Verbally confirmed',true);
alter table public.shortlists_and_admissions enable trigger a_guard_admission_status;
select pg_temp.check_ok((public.dashboard_kpis()->>'admissions_confirmed')::int=1,'Unrecognized legacy text does not count as confirmed');
insert into private.student_sessions values('portal-test-session','30000000-0000-4000-8000-000000000001',now()+interval '1 hour'),('portal-review-session','30000000-0000-4000-8000-000000000004',now()+interval '1 hour');
update public.students set is_profile_complete=true,registration_number='CS-BLR-2026-TESTAA',dob='2007-01-01' where id='30000000-0000-4000-8000-000000000004';
set local role service_role;
do $$declare portal jsonb;begin
 portal=public.student_portal('30000000-0000-4000-8000-000000000001','portal-test-session');
 perform pg_temp.check_ok(jsonb_array_length(portal->'shortlists')=1 and portal::text not like '%Status College%' and portal::text not like '%INTERNAL DRAFT%','Students see only shared shortlists, never internal ones or their statuses');
 portal=public.student_portal('30000000-0000-4000-8000-000000000004','portal-review-session');
 perform pg_temp.check_ok(portal->'shortlists'->0->>'admission_status' is null and portal::text not like '%Verbally confirmed%' and portal::text not like '%legacy%','Students never see legacy status text');
end$$;
reset role;
set local role anon;
select pg_temp.denied($q$select * from public.shortlists_and_admissions$q$);
reset role;

-- Staff resolve a review row: unrelated edits keep it pending review; choosing a status clears the legacy text.
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
update public.shortlists_and_admissions set fees_estimate='3 lakh' where college_name='Review College';
select pg_temp.check_ok((select admission_status is null and legacy_admission_status='Verbally confirmed' from public.shortlists_and_admissions where college_name='Review College'),'Unrelated edits keep the preserved original');
update public.shortlists_and_admissions set admission_status='Applied',legacy_admission_status='Tampered' where college_name='Review College';
select pg_temp.check_ok((select admission_status='Applied' and legacy_admission_status is null from public.shortlists_and_admissions where college_name='Review College'),'Choosing a status resolves the review');
reset role;
select pg_temp.check_ok((public.dashboard_kpis()->>'admissions_confirmed')::int=1,'Resolved Applied row is not confirmed');
rollback;
