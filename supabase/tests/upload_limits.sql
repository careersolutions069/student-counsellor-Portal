begin;
create function pg_temp.check_ok(value boolean,message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
select pg_temp.check_ok((select file_size_limit=4194304 and not public from storage.buckets where id='student-documents'),'Private bucket capped at 4 MiB');
insert into storage.objects(bucket_id,name,metadata) values('student-documents','10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f2000000-0000-4000-8000-000000000001.pdf','{"mimetype":"application/pdf","size":4194305}');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
do $$begin
 begin
  perform public.save_visit_details('30000000-0000-4000-8000-000000000002','{"full_name":"Rahul Kumar","F/N":"Parent","student_phone":"9000000002","city":"Patna","state":"Bihar","counselling_amount":"1000","percentage_or_score":"610","marks_type":"exact","selected_courses":["MBBS"],"college_type":"government"}','10000000-0000-4000-8000-000000000001',null,null,'10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f2000000-0000-4000-8000-000000000001.pdf','limit.pdf');
  raise exception 'FAILED: oversized PDF reference accepted';
 exception when raise_exception then if sqlerrm<>'Uploaded PDF unavailable' then raise;end if;end;
end$$;
reset role;
update storage.objects set metadata='{"mimetype":"application/pdf","size":4194304}' where name='10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f2000000-0000-4000-8000-000000000001.pdf';
set local role authenticated;
select public.save_visit_details('30000000-0000-4000-8000-000000000002','{"full_name":"Rahul Kumar","F/N":"Parent","student_phone":"9000000002","city":"Patna","state":"Bihar","counselling_amount":"1000","percentage_or_score":"610","marks_type":"exact","selected_courses":["MBBS"],"college_type":"government"}','10000000-0000-4000-8000-000000000001',null,null,'10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f2000000-0000-4000-8000-000000000001.pdf','limit.pdf');
select pg_temp.check_ok((select visit_details_completed from public.students where id='30000000-0000-4000-8000-000000000002'),'Exactly 4 MiB accepted');
reset role;
-- Existing files stay accessible when an edit retains the original PDF rather than uploading it.
update storage.objects set metadata='{"mimetype":"application/pdf","size":10485760}' where name='10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f2000000-0000-4000-8000-000000000001.pdf';
set local role authenticated;
select public.save_visit_details('30000000-0000-4000-8000-000000000002','{"full_name":"Rahul Kumar","F/N":"Parent","student_phone":"9000000002","city":"Patna","state":"Bihar","counselling_amount":"1000","percentage_or_score":"610","marks_type":"exact","selected_courses":["MBBS"],"college_type":"government"}','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/college-registration/f2000000-0000-4000-8000-000000000001.pdf','government');
rollback;
