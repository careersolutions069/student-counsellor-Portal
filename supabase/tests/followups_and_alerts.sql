begin;
create function pg_temp.check_ok(value boolean,message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
grant execute on function pg_temp.check_ok(boolean,text) to authenticated;
create temp table t(k text primary key, v text);
grant select,insert,update,delete on t to authenticated;

update public.branches set secure_calling=true,manual_calling=true where id='10000000-0000-4000-8000-000000000001';
insert into auth.users(id,email) values('20000000-0000-4000-8000-0000000000e1','alert.caller@career.test');
insert into public.staff_profiles(id,full_name,email,role,branch_id) values('20000000-0000-4000-8000-0000000000e1','Alert Caller','alert.caller@career.test','tele_counsellor','10000000-0000-4000-8000-000000000001');
insert into public.students(branch_id,assigned_to,full_name,student_phone,pipeline_stage,created_at)
select '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-0000000000e1','Fake Lead '||n,'98522'||lpad(n::text,5,'0'),'New Enquiry',now()-interval '1 day'+n*interval '1 second'
from generate_series(1,50) n;

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000e1',true);

-- Alerts: each number counts once per window, even when the desk reloads.
do $$
declare d jsonb; i int;
begin
 for i in 1..45 loop
  d=public.manual_desk();
  perform public.manual_desk(); -- refresh
  perform public.manual_desk(); -- second refresh
  perform public.save_manual_call((d->'lead'->>'id')::uuid,(d->'lead'->>'assignment')::timestamptz,gen_random_uuid(),'busy','',null);
 end loop;
end $$;
select pg_temp.check_ok((select count(*)=0 from public.caller_alerts),'Caller cannot see alerts about themselves');
select pg_temp.check_ok((public.manual_desk()->>'total')::int=45,'45 calls logged with no fixed delay');

reset role;
select pg_temp.check_ok((select count(*)=40 from private.number_views v join public.caller_alerts a on a.caller_id=v.caller_id where v.caller_id='20000000-0000-4000-8000-0000000000e1' and v.viewed_at<=a.created_at),'Alert raised at the 40th different number, not before');
select pg_temp.check_ok((select count(distinct student_id)=46 and count(*)=46 from private.number_views where caller_id='20000000-0000-4000-8000-0000000000e1'),'Refreshes do not add views: 46 numbers, 46 rows');
select pg_temp.check_ok((select count(*)=1 and max(numbers_viewed)=46 and min(branch_id::text)='10000000-0000-4000-8000-000000000001' from public.caller_alerts where caller_id='20000000-0000-4000-8000-0000000000e1'),'One alert for the window, counting 46 numbers');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select pg_temp.check_ok((select count(*)=0 from public.caller_alerts),'Another branch head does not see the alert');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok((select count(*)=1 from public.caller_alerts where caller_id='20000000-0000-4000-8000-0000000000e1'),'Patna head sees the alert');
select public.review_caller_alert((select id from public.caller_alerts where caller_id='20000000-0000-4000-8000-0000000000e1'));
select pg_temp.check_ok((select reviewed_at is not null from public.caller_alerts where caller_id='20000000-0000-4000-8000-0000000000e1'),'Head marks the alert reviewed');

-- Interested in one click; follow-up list; optional callback; visit clears it; undo removes it.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000e1',true);
do $$
declare d jsonb; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
begin
 d=public.manual_desk();
 perform public.save_manual_call((d->'lead'->>'id')::uuid,(d->'lead'->>'assignment')::timestamptz,a,'interested','Wants hostel details',null);
 perform public.save_manual_call((d->'lead'->>'id')::uuid,(d->'lead'->>'assignment')::timestamptz,a,'interested','Wants hostel details',null); -- double click
 insert into t values('a',a::text),('a_student',d->'lead'->>'id');
 perform public.manual_followup(a,null,now()+interval '3 hours');
 d=public.manual_desk();
 perform public.save_manual_call((d->'lead'->>'id')::uuid,(d->'lead'->>'assignment')::timestamptz,b,'interested','',null);
 perform public.manual_followup(b,now()+interval '2 days',null);
 insert into t values('b',b::text);
 d=public.manual_desk();
 perform public.save_manual_call((d->'lead'->>'id')::uuid,(d->'lead'->>'assignment')::timestamptz,c,'interested','',null);
 perform public.manual_followup(c,null,null);
 insert into t values('c',c::text);
end $$;
select pg_temp.check_ok((public.manual_desk()->>'total')::int=47,'Interested counted once despite the double click; undone entry not counted');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok((select jsonb_array_length(f)=1 and f->0->>'entry_id'=(select v from t where k='a') and f->0->>'remark'='Wants hostel details' and f->0->>'callback_at' is not null
 from (select public.interested_followups() f) x),'Only the pending interested student is listed, with remark and callback');
select public.book_followup_visit((select v::uuid from t where k='a'),now()+interval '1 day');
select pg_temp.check_ok(jsonb_array_length(public.interested_followups())=0,'Head booking a visit clears the follow-up');
select pg_temp.check_ok(exists(select 1 from public.appointments where student_id=(select v::uuid from t where k='a_student') and status='scheduled'),'Visit visible in branch appointments');

-- Same file, same round, imported twice: nobody queued twice and the earlier report is unchanged.
select public.import_calling_leads('10000000-0000-4000-8000-000000000001','Round file.xlsx','[{"row_number":2,"full_name":"Round One","student_phone":"9852300001"},{"row_number":3,"full_name":"Round Two","student_phone":"9852300002"}]','one','{20000000-0000-4000-8000-0000000000e1}','NEET list',current_date,'direct_enquiry','Medical – Round 3',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000e1',true);
insert into t select 'report_before',public.daily_call_report('20000000-0000-4000-8000-0000000000e1',timezone('Asia/Kolkata',now())::date)::text;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
reset role;
insert into t select 'round_next',(select string_agg(coalesce(next_call_at::text,'-'),',' order by student_phone) from public.students where student_phone like '98523%');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
insert into t select 'second',public.import_calling_leads('10000000-0000-4000-8000-000000000001','Round file.xlsx','[{"row_number":2,"full_name":"Round One","student_phone":"9852300001"},{"row_number":3,"full_name":"Round Two","student_phone":"9852300002"}]','one','{20000000-0000-4000-8000-0000000000e1}','NEET list',current_date,'direct_enquiry','Medical – Round 3',true)::text;
select pg_temp.check_ok((select (v::jsonb->>'imported_count')::int=0 and (v::jsonb->>'requeued_count')::int=0 and v::jsonb->'rows' @> '[{"row_number":2,"reason":"Already in this round · not queued again."},{"row_number":3,"reason":"Already in this round · not queued again."}]' from t where k='second'),'Second import of the same round queues nobody');
reset role;
select pg_temp.check_ok((select string_agg(coalesce(next_call_at::text,'-'),',' order by student_phone)=(select v from t where k='round_next') from public.students where student_phone like '98523%'),'Queue times unchanged by the second import');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000e1',true);
select pg_temp.check_ok(public.daily_call_report('20000000-0000-4000-8000-0000000000e1',timezone('Asia/Kolkata',now())::date)::text=(select v from t where k='report_before'),'Earlier report unchanged');
rollback;
