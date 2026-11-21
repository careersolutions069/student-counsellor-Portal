begin;
create function pg_temp.check_ok(value boolean,message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$begin begin execute statement;exception when others then return;end;raise exception 'FAILED: permitted %',statement;end$$;
insert into auth.users(id,email) values('20000000-0000-4000-8000-000000000006','second-caller@career.test');
insert into public.staff_profiles(id,full_name,email,role,branch_id) values('20000000-0000-4000-8000-000000000006','Second Caller','second-caller@career.test','tele_counsellor','10000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.denied($q$select public.bulk_import_leads('10000000-0000-4000-8000-000000000002','test.csv','[{"full_name":"Blocked","student_phone":"9777700101"}]','unassigned')$q$);
select pg_temp.denied($q$select public.bulk_import_leads('10000000-0000-4000-8000-000000000001','test.csv','[{"full_name":"Blocked","student_phone":"9777700101"}]','one',array['20000000-0000-4000-8000-000000000005'::uuid])$q$);
select pg_temp.denied($q$select public.bulk_import_leads('10000000-0000-4000-8000-000000000001','test.csv','[{"full_name":"Blocked","student_phone":"9777700101"}]','round_robin')$q$);
do $$declare r jsonb;begin
 r=public.bulk_import_leads('10000000-0000-4000-8000-000000000001','test.xlsx','[
 {"row_number":2,"full_name":"Imported A","student_phone":"+91 97777-00101","parent_phone":"09100000001"},
 {"row_number":3,"full_name":"Imported B","student_phone":"09777700102","parent_phone":"9100000001"},
 {"row_number":4,"full_name":"Repeated A","student_phone":"9777700101"},
 {"row_number":5,"full_name":"Existing elsewhere","student_phone":"9000000003"},
 {"row_number":6,"full_name":"","student_phone":"9777700104"},
 {"row_number":7,"full_name":"Invalid phone","student_phone":"bad"},
 {"row_number":8,"full_name":"Invalid parent","student_phone":"9777700104","parent_phone":"bad"},
 {"row_number":9,"full_name":"Imported C","student_phone":"9777700103"}
 ]','round_robin',array['20000000-0000-4000-8000-000000000004'::uuid,'20000000-0000-4000-8000-000000000006'::uuid]);
 perform pg_temp.check_ok((r->>'imported_count')::int=3 and (r->>'duplicate_count')::int=2 and (r->>'invalid_count')::int=3 and (r->>'parent_warning_count')::int=2,'Mixed import counts and sibling allowance');
 perform pg_temp.check_ok(jsonb_array_length(r->'rows')=8 and r->'rows'->3->>'reason'='Student Phone already registered.','Every row reported without cross-branch details');
end$$;
select pg_temp.check_ok((select assigned_to='20000000-0000-4000-8000-000000000004' and next_call_at is not null and pipeline_stage='New Enquiry' from public.students where student_phone='9777700103'),'Round robin advances only on inserted rows');
select pg_temp.check_ok((select assigned_to='20000000-0000-4000-8000-000000000006' from public.students where student_phone='9777700102'),'Round robin distributes to second caller');
select pg_temp.check_ok((select count(*)=1 from public.audit_logs where action='bulk_lead_import' and details->>'file_name'='test.xlsx' and actor_id='20000000-0000-4000-8000-000000000002'),'Exactly one summary audit');
select pg_temp.denied($q$select public.owner_conversion_report()$q$);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select pg_temp.denied($q$select public.bulk_import_leads('10000000-0000-4000-8000-000000000001','test.csv','[{"full_name":"Blocked","student_phone":"9777700105"}]','unassigned')$q$);
select pg_temp.denied($q$select public.owner_conversion_report()$q$);
reset role;
update public.staff_profiles set is_active=false where id='20000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.denied($q$select public.bulk_import_leads('10000000-0000-4000-8000-000000000001','test.csv','[{"full_name":"Blocked","student_phone":"9777700105"}]','one',array['20000000-0000-4000-8000-000000000006'::uuid])$q$);
reset role;
update public.staff_profiles set is_active=true where id='20000000-0000-4000-8000-000000000006';
update public.students set created_at='2026-11-10T06:00Z' where student_phone like '977770010%';
update public.students set counselling_amount=case student_phone when '9777700101' then 1000.25 else 2000.50 end,visit_details_completed=true,"F/N"='Fixture parent',city='Patna',state='Bihar',percentage_or_score='610',marks_type='exact',selected_courses=array['MBBS'],college_type='government',college_pdf_path=branch_id::text||'/'||id::text||'/college-registration/test.pdf',college_pdf_name='test.pdf' where student_phone in ('9777700101','9777700102');
update public.students set registration_number='CS-PAT-2026-TESTAA',dob='2007-01-01',is_profile_complete=true where student_phone='9777700101';
insert into public.call_logs(student_id,branch_id,logged_by,outcome) select id,branch_id,'20000000-0000-4000-8000-000000000004','Test' from public.students s cross join generate_series(1,case when s.student_phone='9777700101' then 2 else 1 end) where student_phone in ('9777700101','9777700102');
insert into public.appointments(student_id,branch_id,created_by,scheduled_at,status) select id,branch_id,'20000000-0000-4000-8000-000000000004','2026-11-12T06:00Z',status from public.students cross join (values('missed'),('attended')) a(status) where student_phone='9777700101';
insert into public.appointments(student_id,branch_id,created_by,scheduled_at) select id,branch_id,'20000000-0000-4000-8000-000000000006','2026-11-15T06:00Z' from public.students where student_phone='9777700102';
insert into public.student_counselling(student_id,branch_id,current_phase,allotted_phase,finished) select id,branch_id,2,2,true from public.students where student_phone='9777700101';
insert into public.student_counselling(student_id,branch_id,current_phase) select id,branch_id,4 from public.students where student_phone='9777700102';
insert into public.counselling_documents(student_id,branch_id,doc_category,label,file_name,file_path) select id,branch_id,category,category,'test.pdf',branch_id::text||'/'||id::text||'/counselling/'||gen_random_uuid()::text||'.pdf' from public.students cross join (values('new_choice_pdf'),('new_allotment_letter'),('upgrade_choice_pdf'),('upgraded_allotment_letter')) c(category) where student_phone='9777700101';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
do $$declare r jsonb;caller jsonb;begin
 r=public.owner_conversion_report(null,'2026-11-10T00:00Z','2026-11-11T00:00Z');
 perform pg_temp.check_ok((r->'total'->>'enquiries')::int=3 and (r->'total'->>'invited')::int=2 and (r->'total'->>'attended')::int=2,'Distinct cohort enquiry/invite/visit counts');
 perform pg_temp.check_ok((r->'total'->>'amount')::numeric=3000.75 and (r->'total'->>'registered')::int=1 and (r->'total'->>'allotted')::int=1,'Revenue sum is exact and not multiplied by activity joins');
 perform pg_temp.check_ok(r->'phases'='[0,1,0,0,0,0]' and (r->>'in_counselling')::int=1,'Six phase and not-yet-allotted counts');
 perform pg_temp.check_ok((r->>'new_choices')::int=1 and (r->>'new_allotments')::int=1 and (r->>'upgrade_choices')::int=1 and (r->>'upgrade_allotments')::int=1,'Post-allotment badges');
 select value into caller from jsonb_array_elements(r->'callers') where value->>'id'='20000000-0000-4000-8000-000000000004';
 perform pg_temp.check_ok((caller->>'assigned')::int=2 and (caller->>'calls')::int=3 and (caller->>'invites')::int=1 and (caller->>'attended')::int=1,'Caller metrics use authorship and deduplicated students');
 r=public.owner_conversion_report('10000000-0000-4000-8000-000000000002','2026-11-10T00:00Z','2026-11-11T00:00Z');
 perform pg_temp.check_ok(jsonb_array_length(r->'branches')=1 and (r->'total'->>'enquiries')::int=0 and (r->'total'->>'amount')::numeric=0,'Branch/date filters and zero totals');
end$$;
select pg_temp.denied($q$select public.owner_conversion_report(null,'2026-11-11','2026-11-10')$q$);
reset role;
update public.staff_profiles set is_active=false where id='20000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.denied($q$select public.bulk_import_leads('10000000-0000-4000-8000-000000000001','test.csv','[{"full_name":"Blocked","student_phone":"9777700105"}]','unassigned')$q$);
reset role;
set local role anon;
select pg_temp.denied($q$select public.owner_conversion_report()$q$);
select pg_temp.denied($q$select public.bulk_import_leads(null,'test.csv','[]','unassigned')$q$);
rollback;
