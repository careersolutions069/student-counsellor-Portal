begin;
create function pg_temp.check_ok(value boolean,message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
insert into public.students(id,branch_id,assigned_to,full_name,student_phone,parent_phone) values
 ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',auth.uid(),'Sibling One','9888888801','9888888877'),
 ('a0000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',auth.uid(),'Sibling Two','9888888802','9888888877');
select pg_temp.check_ok(public.parent_phone_in_branch('9888888877','a0000000-0000-4000-8000-000000000001',null),'Parent sharing warning');
select pg_temp.check_ok((public.counsellor_queue('to_call',1)->>'total')::int>=2,'New assigned leads enter queue');
select public.record_counsellor_action('a0000000-0000-4000-8000-000000000001','{"full_name":"Sibling One","parent_phone":"9888888877","target_course":"B.Com","academic_stream":"Commerce"}','invite','b0000000-0000-4000-8000-000000000001',now()+interval '1 day');
select pg_temp.check_ok((select pipeline_stage='F2F Scheduled' and target_course='B.Com' from public.students where id='a0000000-0000-4000-8000-000000000001'),'Invite saves education and stage');
select public.record_counsellor_action('a0000000-0000-4000-8000-000000000001','{"full_name":"Retry ignored"}','invite','b0000000-0000-4000-8000-000000000001',now()+interval '1 day');
select pg_temp.check_ok((select count(*)=1 from public.call_logs where id='b0000000-0000-4000-8000-000000000001'),'Retry logs exactly once');
select pg_temp.check_ok(exists(select 1 from jsonb_array_elements(public.counsellor_queue('invited')->'students') x where x->>'id'='a0000000-0000-4000-8000-000000000001'),'Invited queue');
do $$begin
 begin perform public.record_counsellor_action('30000000-0000-4000-8000-000000000003','{"full_name":"Forbidden"}','details');raise exception 'FAILED: foreign branch mutation';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
 begin insert into public.students(branch_id,assigned_to,full_name,student_phone) values('10000000-0000-4000-8000-000000000001',auth.uid(),'Duplicate','9888888801');raise exception 'FAILED: duplicate student phone';exception when unique_violation then null;end;
 begin perform public.record_counsellor_action('a0000000-0000-4000-8000-000000000001','{"full_name":"Should roll back"}','callback','b0000000-0000-4000-8000-000000000002');raise exception 'FAILED: missing callback accepted';exception when raise_exception then if sqlerrm<>'Next callback date and time required' then raise;end if;end;
 if (select full_name from public.students where id='a0000000-0000-4000-8000-000000000001')<>'Sibling One' then raise exception 'FAILED: partial outcome changed profile';end if;
 begin update public.appointments set status='missed' where id='b0000000-0000-4000-8000-000000000001';raise exception 'FAILED: caller marked attendance';exception when raise_exception then if sqlerrm<>'Only centre management can mark attendance' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok(exists(select 1 from public.appointments a join public.students s on s.id=a.student_id where a.id='b0000000-0000-4000-8000-000000000001' and s.academic_stream='Commerce'),'Centre Head sees invite and education');
update public.appointments set status='missed' where id='b0000000-0000-4000-8000-000000000001';
select pg_temp.check_ok(exists(select 1 from public.audit_logs where entity_id='b0000000-0000-4000-8000-000000000001' and entity_type='call_logs'),'Call audited');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select pg_temp.check_ok(exists(select 1 from jsonb_array_elements(public.counsellor_queue('missed')->'students') x where x->>'id'='a0000000-0000-4000-8000-000000000001'),'Head missed status returns lead to caller');
do $$begin
 begin update public.appointments set status='scheduled' where id='b0000000-0000-4000-8000-000000000001';raise exception 'FAILED: caller reopened attendance';exception when raise_exception then if sqlerrm<>'Only centre management can mark attendance' then raise;end if;end;
end$$;
select public.record_counsellor_action('a0000000-0000-4000-8000-000000000001','{"full_name":"Sibling One"}','callback','b0000000-0000-4000-8000-000000000006',null,now()+interval '10 days');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
update public.appointments set status='missed' where id='b0000000-0000-4000-8000-000000000001';
select pg_temp.check_ok((select pipeline_stage='Contacted' and next_call_at>now()+interval '9 days' from public.students where id='a0000000-0000-4000-8000-000000000001'),'Repeated missed preserves callback');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
update public.students set pipeline_stage='F2F Missed' where id='a0000000-0000-4000-8000-000000000002';
select pg_temp.check_ok(exists(select 1 from jsonb_array_elements(public.counsellor_queue('missed')->'students') x where x->>'id'='a0000000-0000-4000-8000-000000000002'),'Legacy missed lead without appointment remains visible');
select public.record_counsellor_action('a0000000-0000-4000-8000-000000000001','{"full_name":"Sibling One"}','invite','b0000000-0000-4000-8000-000000000003',now()+interval '2 days');
select pg_temp.check_ok(not exists(select 1 from jsonb_array_elements(public.counsellor_queue('missed')->'students') x where x->>'id'='a0000000-0000-4000-8000-000000000001'),'Reinvite clears historical missed state');
select public.record_counsellor_action('a0000000-0000-4000-8000-000000000001','{"full_name":"Sibling One"}','callback','b0000000-0000-4000-8000-000000000004',null,now()-interval '1 hour','Call again');
select pg_temp.check_ok(exists(select 1 from jsonb_array_elements(public.counsellor_queue('to_call')->'students') x where x->>'id'='a0000000-0000-4000-8000-000000000001'),'Due callback queue');
select public.record_counsellor_action('a0000000-0000-4000-8000-000000000001','{"full_name":"Sibling One"}','dropped','b0000000-0000-4000-8000-000000000005',null,null,'Discussed options','Not proceeding');
select pg_temp.check_ok((select pipeline_stage='Dropped' and drop_reason='Not proceeding' and next_call_at is null from public.students where id='a0000000-0000-4000-8000-000000000001'),'Drop reason stored');
select pg_temp.check_ok(not exists(select 1 from jsonb_array_elements(public.counsellor_queue('to_call')->'students') x where x->>'id'='a0000000-0000-4000-8000-000000000001'),'Dropped lead removed from queue');
reset role;
update public.staff_profiles set is_active=false where id='20000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.check_ok((public.counsellor_queue('to_call')->>'total')::int=0,'Inactive caller sees no queue');
rollback;
