begin;
create function pg_temp.check_ok(value boolean,message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if sqlerrm not like expected then raise exception 'FAILED: % raised "%" instead of "%"',statement,sqlerrm,expected; end if;
  return;
 end;
 raise exception 'FAILED: % was allowed',statement;
end$$;
-- Queue and report fingerprints for the test caller's students.
create function pg_temp.queue_state() returns text language sql as $$
 select string_agg(concat_ws('|',student_phone,next_call_at,assigned_to,import_file,call_campaign,pipeline_stage,calling_status),',' order by student_phone) from public.students where student_phone like '98544%'
$$;
create function pg_temp.call_history() returns text language sql as $$
 select string_agg(concat_ws('|',id,day,status,file_name,campaign,undone),',' order by id) from private.manual_calls where caller_id='20000000-0000-4000-8000-0000000000d1'
$$;
grant execute on function pg_temp.check_ok(boolean,text),pg_temp.expect_error(text,text) to authenticated;
create temp table t(k text primary key, v text);
grant select,insert,update on t to authenticated;

update public.branches set secure_calling=true,manual_calling=true where id='10000000-0000-4000-8000-000000000001';
insert into auth.users(id,email) values('20000000-0000-4000-8000-0000000000d1','round.caller@career.test');
insert into public.staff_profiles(id,full_name,email,role,branch_id) values('20000000-0000-4000-8000-0000000000d1','Round Caller','round.caller@career.test','tele_counsellor','10000000-0000-4000-8000-000000000001');
create temp table rows_json as select '[{"row_number":2,"full_name":"Round Student A","student_phone":"9854400001"},{"row_number":3,"full_name":"Round Student B","student_phone":"9854400002"},{"row_number":4,"full_name":"Round Student C","student_phone":"9854400003"}]'::jsonb as v;
grant select on rows_json to authenticated;

-- Logs every lead currently due for the test caller, with the given outcome.
create function pg_temp.log_all(outcome text) returns int language plpgsql as $$
declare d jsonb; n int:=0;
begin
 loop
  d=public.manual_desk();
  exit when d->'lead'='null'::jsonb or n>10;
  perform public.save_manual_call((d->'lead'->>'id')::uuid,(d->'lead'->>'assignment')::timestamptz,gen_random_uuid(),outcome,'',null);
  n=n+1;
 end loop;
 return n;
end $$;
grant execute on function pg_temp.log_all(text) to authenticated;

set local role authenticated;
-- Round 1: import and call.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select public.import_calling_leads('10000000-0000-4000-8000-000000000001','Round 1.xlsx',(select v from rows_json),'one','{20000000-0000-4000-8000-0000000000d1}','NEET list',current_date,'direct_enquiry','Medical – Round 1',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000d1',true);
select pg_temp.check_ok(pg_temp.log_all('busy')=3,'Round 1: three calls logged');

-- Round 2: same students back in the queue under the new round, and called again.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
insert into t select 'r2',public.import_calling_leads('10000000-0000-4000-8000-000000000001','Round 2.xlsx',(select v from rows_json),'one','{20000000-0000-4000-8000-0000000000d1}','NEET list',current_date,'direct_enquiry','Medical – Round 2',true)::text;
select pg_temp.check_ok((select (v::jsonb->>'requeued_count')::int=3 from t where k='r2'),'Round 2 requeues all three');
-- Inside one test transaction now() stands still; make the requeued students due.
reset role;
update public.students set next_call_at=now()-interval '1 minute' where student_phone like '98544%';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000d1',true);
select pg_temp.check_ok(pg_temp.log_all('no_answer')=3,'Round 2: three calls logged');

-- A call from an earlier day, to check a historical report too.
reset role;
insert into private.manual_calls(id,student_id,caller_id,branch_id,day,status,file_name,campaign,previous_state,saved_state)
select gen_random_uuid(),id,'20000000-0000-4000-8000-0000000000d1','10000000-0000-4000-8000-000000000001',timezone('Asia/Kolkata',now())::date-3,'interested','Round 1.xlsx','Medical – Round 1','{}','{}' from public.students where student_phone='9854400001';
insert into t values('queue',pg_temp.queue_state()),('history',pg_temp.call_history());
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000d1',true);
insert into t select 'report_today',public.daily_call_report(auth.uid(),timezone('Asia/Kolkata',now())::date)::text;
insert into t select 'report_past',public.daily_call_report(auth.uid(),timezone('Asia/Kolkata',now())::date-3)::text;

-- Round 1 again, with and without the repeat-round box: nothing changes.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
insert into t select 'r1_again',public.import_calling_leads('10000000-0000-4000-8000-000000000001','Round 1.xlsx',(select v from rows_json),'one','{20000000-0000-4000-8000-0000000000d1}','NEET list',current_date,'direct_enquiry','Medical – Round 1',true)::text;
insert into t select 'r1_plain',public.import_calling_leads('10000000-0000-4000-8000-000000000001','Round 1.xlsx',(select v from rows_json),'one','{20000000-0000-4000-8000-0000000000d1}','NEET list',current_date,'direct_enquiry','Medical – Round 1',false)::text;
select pg_temp.check_ok((select (v::jsonb->>'requeued_count')::int=0 and (v::jsonb->>'imported_count')::int=0
 and (select count(*) from jsonb_array_elements(v::jsonb->'rows') r where r->>'reason'='Already in this round · not queued again.')=3 from t where k='r1_again'),'Round 1 again queues nobody');
select pg_temp.check_ok((select (v::jsonb->>'imported_count')::int=0 and (v::jsonb->>'duplicate_count')::int=3 from t where k='r1_plain'),'Plain re-import only skips');
reset role;
select pg_temp.check_ok(pg_temp.queue_state()=(select v from t where k='queue'),'Queue unchanged after Round 1 again');
select pg_temp.check_ok(pg_temp.call_history()=(select v from t where k='history'),'Logged calls unchanged after Round 1 again');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000d1',true);
select pg_temp.check_ok(public.daily_call_report(auth.uid(),timezone('Asia/Kolkata',now())::date)::text=(select v from t where k='report_today'),'Today report unchanged');
select pg_temp.check_ok(public.daily_call_report(auth.uid(),timezone('Asia/Kolkata',now())::date-3)::text=(select v from t where k='report_past'),'Earlier report unchanged');
select pg_temp.check_ok((select jsonb_array_length(v::jsonb->'groups')=2 from t where k='report_today'),'Today report keeps both rounds separate');

-- Transfer with a pending Interested follow-up.
reset role;
update public.students set next_call_at=now()-interval '1 minute',pipeline_stage='Contacted' where student_phone in ('9854400001','9854400002');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000d1',true);
select pg_temp.check_ok(pg_temp.log_all('interested')=2,'Two students marked Interested');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok(jsonb_array_length(public.interested_followups())=2,'Patna head sees both follow-ups before transfer');
insert into t select 'entries',string_agg(f->>'entry_id',',' order by f->>'full_name') from jsonb_array_elements(public.interested_followups()) f;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select public.transfer_student(id,'10000000-0000-4000-8000-000000000002','Family moved') from public.students where student_phone in ('9854400001','9854400002');
-- Old head loses it.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok(jsonb_array_length(public.interested_followups())=0,'Old head no longer sees the follow-ups');
select pg_temp.expect_error($$select public.book_followup_visit((select split_part(v,',',1)::uuid from t where k='entries'),now()+interval '1 day')$$,'Access denied');
select pg_temp.expect_error($$select public.dismiss_followup((select split_part(v,',',2)::uuid from t where k='entries'))$$,'Access denied');
-- New head sees and manages them.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select pg_temp.check_ok(jsonb_array_length(public.interested_followups())=2,'New head sees both follow-ups');
select public.book_followup_visit((select split_part(v,',',1)::uuid from t where k='entries'),now()+interval '1 day');
select public.dismiss_followup((select split_part(v,',',2)::uuid from t where k='entries'));
select pg_temp.check_ok(jsonb_array_length(public.interested_followups())=0,'New head cleared both');
select pg_temp.check_ok(exists(select 1 from public.appointments a join public.students s on s.id=a.student_id where s.student_phone='9854400001' and a.status='scheduled' and a.branch_id='10000000-0000-4000-8000-000000000002'),'Visit booked in the new branch');
rollback;
