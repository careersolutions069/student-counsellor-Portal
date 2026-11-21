begin;
create function pg_temp.check_ok(value boolean,message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
insert into storage.objects(bucket_id,name,metadata) values
 ('student-documents','10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f1000000-0000-4000-8000-000000000001.pdf','{"mimetype":"application/pdf","size":4194304}'),
 ('student-documents','10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f1000000-0000-4000-8000-000000000002.pdf','{"mimetype":"application/pdf","size":100}');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
do $$begin
 begin perform public.complete_student_profile('30000000-0000-4000-8000-000000000002','Rahul Kumar','9000000002','2007-01-01');raise exception 'FAILED: generated before visit';exception when raise_exception then if sqlerrm<>'Save visit details before generating registration' then raise;end if;end;
 begin perform public.save_visit_details('30000000-0000-4000-8000-000000000002','{"full_name":"Rahul Kumar","F/N":"Parent","student_phone":"9000000002","city":"Patna","state":"Bihar","counselling_amount":"1000.50","percentage_or_score":"610","marks_type":"exact","selected_courses":["MBBS","BDS"],"college_type":"government"}','10000000-0000-4000-8000-000000000001',null,null);raise exception 'FAILED: saved without PDF';exception when raise_exception then if sqlerrm<>'Upload a new PDF for the selected college type' then raise;end if;end;
end$$;
select public.save_visit_details('30000000-0000-4000-8000-000000000002','{"full_name":"Rahul Kumar","F/N":"Parent","student_phone":"+91 90000 00002","city":"Patna","state":"Bihar","counselling_amount":"1000.50","percentage_or_score":"610","marks_type":"exact","selected_courses":["MBBS","BDS"],"college_type":"government"}','10000000-0000-4000-8000-000000000001',null,null,'10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f1000000-0000-4000-8000-000000000001.pdf','government.pdf');
select pg_temp.check_ok((select visit_details_completed and registration_number is null and not is_profile_complete and student_phone='9000000002' from public.students where id='30000000-0000-4000-8000-000000000002'),'Visit save never generates ID');
select pg_temp.check_ok((select counselling_amount=1000.50 and college_pdf_name='government.pdf' from public.managed_students() where id='30000000-0000-4000-8000-000000000002'),'Manager reads fee and PDF through authorized projection');
do $$begin
 begin perform public.complete_student_profile('30000000-0000-4000-8000-000000000002','Rahul Kumar','9000000002',null);raise exception 'FAILED: generated without DOB';exception when raise_exception then if sqlerrm<>'Name, 10-digit phone and valid DOB required' then raise;end if;end;
 begin perform public.save_visit_details('30000000-0000-4000-8000-000000000002','{"full_name":"Rahul Kumar","F/N":"Parent","student_phone":"9000000002","city":"Patna","state":"Bihar","counselling_amount":"1000.50","percentage_or_score":"610","marks_type":"approximate","selected_courses":["BAMS"],"college_type":"private"}','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f1000000-0000-4000-8000-000000000001.pdf','government');raise exception 'FAILED: changed college type without replacement';exception when raise_exception then if sqlerrm<>'Upload a new PDF for the selected college type' then raise;end if;end;
end$$;
select public.save_visit_details('30000000-0000-4000-8000-000000000002','{"full_name":"Rahul Kumar","F/N":"Parent","student_phone":"9000000002","city":"Patna","state":"Bihar","counselling_amount":"1000.50","percentage_or_score":"610","marks_type":"approximate","selected_courses":["BAMS"],"college_type":"private"}','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f1000000-0000-4000-8000-000000000001.pdf','government','10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f1000000-0000-4000-8000-000000000002.pdf','private.pdf');
select pg_temp.check_ok(public.complete_student_profile('30000000-0000-4000-8000-000000000002','Rahul Kumar','9000000002','2007-01-01') ~ '^CS-PAT-[0-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$','Random ID shape');
select pg_temp.check_ok((select right(registration_number,6) ~ '[A-Z]' and right(registration_number,6) ~ '[2-9]' from public.students where id='30000000-0000-4000-8000-000000000002'),'ID mixes letter and digit');
select pg_temp.check_ok(public.complete_student_profile('30000000-0000-4000-8000-000000000002','Rahul Kumar','9000000002','2007-01-01')=(select registration_number from public.students where id='30000000-0000-4000-8000-000000000002'),'Retry keeps random ID');
select pg_temp.check_ok(exists(select 1 from public.audit_logs where entity_id='30000000-0000-4000-8000-000000000002' and details->'after'->>'visit_details_completed'='true'),'Visit saved in audit');
select pg_temp.check_ok(public.complete_student_profile('30000000-0000-4000-8000-000000000001','Aditi Verma','9000000001','2007-05-12')='CS-PAT-2026-0001','Legacy ID preserved without new visit');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select pg_temp.check_ok((select count(*)=0 from public.managed_students()),'Caller gets no manager records');
do $$begin
 begin perform counselling_amount from public.students;raise exception 'FAILED: caller read fee';exception when insufficient_privilege then null;end;
 begin perform college_pdf_path from public.students;raise exception 'FAILED: caller read college file';exception when insufficient_privilege then null;end;
 begin update public.students set college_type='private' where id='30000000-0000-4000-8000-000000000001';raise exception 'FAILED: caller bypassed college type PDF rule';exception when insufficient_privilege then null;end;
 begin update public.students set visit_details_completed=true where id='30000000-0000-4000-8000-000000000001';raise exception 'FAILED: forged visit completed';exception when insufficient_privilege then null;end;
 if public.counsellor_queue('invited')::text ~ 'counselling_amount|college_pdf_path|college_pdf_name' then raise exception 'FAILED: private caller queue';end if;
end$$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select pg_temp.check_ok(not exists(select 1 from public.managed_students() where id='30000000-0000-4000-8000-000000000002'),'Other head cannot read visit');
reset role;
insert into private.student_sessions values('visit-portal-test','30000000-0000-4000-8000-000000000002',now()+interval '1 hour');
select pg_temp.check_ok(public.student_portal('30000000-0000-4000-8000-000000000002','visit-portal-test')::text !~ 'counselling_amount|college_pdf|1000.50','Student projection hides fee and college files');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select public.transfer_student('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Visit transfer test');
select pg_temp.check_ok((select registration_number ~ '^CS-PAT-' and college_pdf_name='private.pdf' from public.managed_students() where id='30000000-0000-4000-8000-000000000002'),'Transfer preserves random ID and college PDF');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok(not exists(select 1 from public.audit_logs where details::text ~ 'counselling_amount|college_pdf_path|college_pdf_name|1000.50|government.pdf|private.pdf'),'Source branch audit history has no protected visit values');
rollback;
