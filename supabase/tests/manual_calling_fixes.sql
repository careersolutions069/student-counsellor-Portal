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
grant execute on function pg_temp.check_ok(boolean,text),pg_temp.expect_error(text,text) to authenticated;
create temp table t(k text primary key, v text);
grant select,insert,update on t to authenticated;

update public.branches set secure_calling=true,manual_calling=true where id='10000000-0000-4000-8000-000000000001';
insert into auth.users(id,email) values('20000000-0000-4000-8000-0000000000f1','fix.caller@career.test');
insert into public.staff_profiles(id,full_name,email,role,branch_id) values('20000000-0000-4000-8000-0000000000f1','Fix Caller','fix.caller@career.test','tele_counsellor','10000000-0000-4000-8000-000000000001');
insert into public.students(id,branch_id,assigned_to,full_name,student_phone,pipeline_stage,calling_status) values
 ('f0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null,'Existing Open','9851100001','Contacted','eligible'),
 ('f0000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',null,'Existing Closed','9851100002','Closed','eligible'),
 ('f0000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',null,'Existing DNC','9851100003','Contacted','do_not_contact');

-- 1. Repeat-call round.
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
insert into t select 'import',public.import_calling_leads('10000000-0000-4000-8000-000000000001','Round 2.csv',
 '[{"row_number":2,"full_name":"Existing Open","student_phone":"9851100001"},{"row_number":3,"full_name":"Existing Closed","student_phone":"9851100002"},{"row_number":4,"full_name":"Existing DNC","student_phone":"9851100003"},{"row_number":5,"full_name":"Other Branch","student_phone":"9000000003"},{"row_number":6,"full_name":"Brand New","student_phone":"9851100006"}]',
 'one','{20000000-0000-4000-8000-0000000000f1}','NEET list',current_date,'direct_enquiry','Medical – Round 2',true)::text;
select pg_temp.check_ok((select (v::jsonb->>'requeued_count')::int=1 and (v::jsonb->>'imported_count')::int=1 and (v::jsonb->>'duplicate_count')::int=3 from t where k='import'),'One requeued, one new, three left alone');
select pg_temp.check_ok((select v::jsonb->'rows' @> '[{"row_number":4,"reason":"Already in portal · Do not call, not queued."},{"row_number":3,"reason":"Already in portal · closed, not queued."},{"row_number":5,"reason":"Already registered in another branch · not queued."},{"row_number":2,"status":"requeued"}]' from t where k='import'),'Row reasons explain each existing student');
reset role;
select pg_temp.check_ok((select import_file='Round 2.csv' and call_campaign='Medical – Round 2' and assigned_to='20000000-0000-4000-8000-0000000000f1' and next_call_at<=clock_timestamp() from public.students where id='f0000000-0000-4000-8000-000000000001'),'Existing open student takes the new round');
select pg_temp.check_ok((select assigned_to is null and import_file is null from public.students where id='f0000000-0000-4000-8000-000000000003'),'Do not call student untouched');
select pg_temp.check_ok((select assigned_to is null from public.students where id='f0000000-0000-4000-8000-000000000002'),'Closed student untouched');
update public.students set next_call_at=now()-interval '1 minute' where id='f0000000-0000-4000-8000-000000000001';
set local role authenticated;

-- 2 and 4. Logging floor and interested follow-up.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000f1',true);
insert into t select 'lead1',public.manual_desk()->'lead'->>'id';
insert into t select 'stamp1',public.manual_desk()->'lead'->>'assignment';
select public.save_manual_call((select v::uuid from t where k='lead1'),(select v::timestamptz from t where k='stamp1'),'e0000000-0000-4000-8000-000000000001','busy','',null);
select public.save_manual_call((select v::uuid from t where k='lead1'),(select v::timestamptz from t where k='stamp1'),'e0000000-0000-4000-8000-000000000001','busy','',null);
insert into t select 'lead2',public.manual_desk()->'lead'->>'id';
insert into t select 'stamp2',public.manual_desk()->'lead'->>'assignment';
select pg_temp.check_ok((select a.v<>b.v from t a, t b where a.k='lead1' and b.k='lead2'),'Next lead opened');
reset role;
update private.manual_calls set created_at=created_at-interval '11 seconds' where caller_id='20000000-0000-4000-8000-0000000000f1';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000f1',true);
select pg_temp.expect_error($$select public.save_manual_call((select v::uuid from t where k='lead2'),(select v::timestamptz from t where k='stamp2'),'e0000000-0000-4000-8000-000000000002','interested','',now()+interval '1 day',now()+interval '2 days')$$,'Choose a visit or a callback, not both.');
select public.save_manual_call((select v::uuid from t where k='lead2'),(select v::timestamptz from t where k='stamp2'),'e0000000-0000-4000-8000-000000000002','interested','Wants Saturday',null,now()+interval '2 days');
select pg_temp.check_ok(exists(select 1 from public.appointments where id='e0000000-0000-4000-8000-000000000002' and status='scheduled'),'Interested with a visit books it');
-- Undo removes the visit and the entry, and reopens the lead.
select public.manual_followup('e0000000-0000-4000-8000-000000000002',null);
select pg_temp.check_ok(not exists(select 1 from public.appointments where id='e0000000-0000-4000-8000-000000000002'),'Undo removes the visit');
select pg_temp.check_ok((public.manual_desk()->'lead'->>'id')=(select v from t where k='lead2'),'Undo reopens the lead');
insert into t select 'stamp3',public.manual_desk()->'lead'->>'assignment';
select public.save_manual_call((select v::uuid from t where k='lead2'),(select v::timestamptz from t where k='stamp3'),'e0000000-0000-4000-8000-000000000003','interested','',now()+interval '3 hours');
reset role;
select pg_temp.check_ok((select next_call_at>now() and pipeline_stage='Contacted' from public.students where id=(select v::uuid from t where k='lead2')),'Interested with a callback stays in the queue');
set local role authenticated;

-- 2. Centre Head sees calls logged and quick entries.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok((select (a->'20000000-0000-4000-8000-0000000000f1'->>'logged')::int=2 and (a->'20000000-0000-4000-8000-0000000000f1'->>'quick')::int=1 from (select public.manual_activity() a) x),'Head sees two logged, one within 20 seconds');
rollback;
