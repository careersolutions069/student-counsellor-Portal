begin;
create function pg_temp.check_ok(value boolean,message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
select pg_temp.check_ok((select not allow_student_upload from public.students where id='30000000-0000-4000-8000-000000000001'),'Uploads disabled by default');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
insert into public.student_documents(id,student_id,branch_id,document_name) values('e0000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10th Marksheet');
select pg_temp.check_ok(exists(select 1 from public.audit_logs where entity_id='e0000000-0000-4000-8000-000000000001' and action='insert'),'Checklist creation audited');
do $$begin
 begin insert into public.student_documents(student_id,branch_id,document_name) values('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Forbidden');raise exception 'FAILED: foreign branch checklist';exception when insufficient_privilege then null;end;
 begin update public.student_documents set file_path='stolen/path.pdf' where id='e0000000-0000-4000-8000-000000000001';raise exception 'FAILED: forged path';exception when raise_exception then if sqlerrm<>'Document identity and files are server managed' then raise;end if;end;
 begin perform public.document_access('e0000000-0000-4000-8000-000000000001');raise exception 'FAILED: public privileged RPC';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select pg_temp.check_ok((select count(*)=0 from public.student_documents),'Other branch cannot read checklist');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select pg_temp.check_ok((select count(*)=0 from public.student_documents),'Callers cannot read documents');
do $$begin
 begin update public.students set allow_student_upload=true where id='30000000-0000-4000-8000-000000000001';raise exception 'FAILED: caller enabled uploads';exception when raise_exception then if sqlerrm<>'Only centre management can allow document uploads' then raise;end if;end;
 begin insert into public.student_documents(student_id,branch_id,document_name) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Forbidden');raise exception 'FAILED: caller checklist';exception when insufficient_privilege then null;end;
end$$;
reset role;
insert into private.student_sessions values('document-test-session','30000000-0000-4000-8000-000000000001',now()+interval '1 hour');
select pg_temp.check_ok(public.document_access('e0000000-0000-4000-8000-000000000001',null,'30000000-0000-4000-8000-000000000001','document-test-session',false)->>'document_name'='10th Marksheet','Student may view own checklist with uploads off');
do $$begin
 begin perform public.document_access('e0000000-0000-4000-8000-000000000001',null,'30000000-0000-4000-8000-000000000001','document-test-session',true);raise exception 'FAILED: disabled student upload';exception when raise_exception then if sqlerrm<>'Student uploads are disabled or this document is verified' then raise;end if;end;
 begin perform public.document_access('e0000000-0000-4000-8000-000000000001',null,'30000000-0000-4000-8000-000000000003','document-test-session');raise exception 'FAILED: other student access';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
update public.students set allow_student_upload=true where id='30000000-0000-4000-8000-000000000001';
reset role;
select public.finalize_document_upload('e0000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001/e0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.pdf','marks.pdf','Verified',(select updated_at from public.student_documents where id='e0000000-0000-4000-8000-000000000001'),null,'30000000-0000-4000-8000-000000000001','document-test-session');
select pg_temp.check_ok((select status='Uploaded' and uploaded_by_role='student' from public.student_documents where id='e0000000-0000-4000-8000-000000000001'),'Student cannot self-verify');
select pg_temp.check_ok(exists(select 1 from public.audit_logs where entity_id='e0000000-0000-4000-8000-000000000001' and actor_role='student' and action='upload' and details->>'student_id'='30000000-0000-4000-8000-000000000001'),'Student upload attributed in audit');
do $$begin
 begin perform public.finalize_document_upload('e0000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001/e0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002.pdf','stale.pdf','Uploaded',now()-interval '1 hour',null,'30000000-0000-4000-8000-000000000001','document-test-session');raise exception 'FAILED: stale upload overwrote file';exception when raise_exception then if sqlerrm<>'Document changed; refresh and try again' then raise;end if;end;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
update public.student_documents set status='Verified',remarks='Checked original marksheet' where id='e0000000-0000-4000-8000-000000000001';
reset role;
do $$begin
 begin perform public.document_access('e0000000-0000-4000-8000-000000000001',null,'30000000-0000-4000-8000-000000000001','document-test-session',true);raise exception 'FAILED: verified student replacement';exception when raise_exception then if sqlerrm<>'Student uploads are disabled or this document is verified' then raise;end if;end;
 if public.student_portal('30000000-0000-4000-8000-000000000001','document-test-session')::text ~ 'INTERNAL ONLY|INTERNAL DRAFT|budget_range|drop_reason|call_logs|file_path|uploaded_by_role' then raise exception 'FAILED: private student projection';end if;
end$$;
select public.finalize_document_upload('e0000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001/e0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000003.png','staff.png','Verified',(select updated_at from public.student_documents where id='e0000000-0000-4000-8000-000000000001'),'20000000-0000-4000-8000-000000000002');
select pg_temp.check_ok((select uploaded_by_role='centre_head' from public.student_documents where id='e0000000-0000-4000-8000-000000000001'),'Head upload attribution');
update public.staff_profiles set is_active=false where id='20000000-0000-4000-8000-000000000002';
do $$begin
 begin perform public.document_access('e0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');raise exception 'FAILED: inactive staff document access';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end$$;
update public.staff_profiles set is_active=true where id='20000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select public.transfer_student('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Document transfer test');
select pg_temp.check_ok((select branch_id='10000000-0000-4000-8000-000000000002' from public.student_documents where id='e0000000-0000-4000-8000-000000000001'),'Documents transfer branch automatically');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok((select count(*)=0 from public.student_documents),'Old head loses document scope after transfer');
reset role;
select pg_temp.check_ok(public.student_portal('30000000-0000-4000-8000-000000000001','document-test-session') is null,'Transfer invalidates student session');
select pg_temp.check_ok((select not public and file_size_limit=4194304 and allowed_mime_types=array['application/pdf','image/jpeg','image/png'] from storage.buckets where id='student-documents'),'Private restricted bucket');
rollback;
