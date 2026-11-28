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
grant execute on function pg_temp.check_ok(boolean,text),pg_temp.expect_error(text,text) to authenticated,service_role;

-- A dedicated caller keeps this test independent of other local leads.
insert into auth.users(id,email) values('20000000-0000-4000-8000-0000000000c1','secure.caller@career.test');
insert into public.staff_profiles(id,full_name,email,role,branch_id) values('20000000-0000-4000-8000-0000000000c1','Secure Caller','secure.caller@career.test','tele_counsellor','10000000-0000-4000-8000-000000000001');
insert into public.students(id,branch_id,assigned_to,full_name,student_phone,parent_phone,pipeline_stage,created_at) values
 ('c0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-0000000000c1','Meera Devi Kumari','9777700001','9777700091','New Enquiry',now()-interval '2 days'),
 ('c0000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-0000000000c1','Karan Singh','9777700002',null,'New Enquiry',now()-interval '1 day');
update public.branches set secure_calling=false where id='10000000-0000-4000-8000-000000000001';

set local role authenticated;
-- Off: today's behaviour.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000c1',true);
select pg_temp.check_ok((select count(*)=2 from public.students),'Before switch-on the caller reads assigned rows as today');
select pg_temp.expect_error('select public.caller_desk()','Access denied');

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
update public.branches set secure_calling=true where id='10000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($$select public.set_caller_settings('20000000-0000-4000-8000-000000000005',600,'9876543210')$$,'Access denied');

-- No work phone yet: the provider has nobody to ring.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000c1',true);
select pg_temp.expect_error($$select public.begin_call_attempt((public.caller_desk()->'lead'->>'id')::uuid,'student','fake')$$,'Ask your Centre Head%');

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select public.set_caller_settings('20000000-0000-4000-8000-0000000000c1',600,'98765 43210');

-- Caller in a secure branch: no route to a number.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000c1',true);
select pg_temp.check_ok((select count(*)=0 from public.students),'Secure caller cannot select students');
select pg_temp.check_ok((select count(*)=0 from public.caller_student_records),'Secure caller cannot use the caller view');
select pg_temp.check_ok((public.counsellor_queue('to_call',1)->>'total')::int=0,'Old queue returns nothing');
select pg_temp.check_ok((select count(*)=0 from public.call_logs c join public.students s on s.id=c.student_id),'Joins through calls stay blocked');
select pg_temp.check_ok((select count(*)=0 from public.audit_logs),'Caller cannot read the audit log');
select pg_temp.expect_error($$select public.parent_phone_in_branch('9777700091')$$,'Access denied');
select pg_temp.expect_error($$insert into public.students(branch_id,assigned_to,full_name,student_phone) values('10000000-0000-4000-8000-000000000001',auth.uid(),'Probe','9777700001')$$,'%row-level security%');
with changed as (update public.students set target_course='x' where id='c0000000-0000-4000-8000-000000000001' returning id) select pg_temp.check_ok((select count(*)=0 from changed),'Secure caller cannot update rows directly');

create temp table desk_state as select public.caller_desk() as first, public.caller_desk() as second;
grant select on desk_state to authenticated,service_role;
select pg_temp.check_ok((select first->'lead'->>'id'='c0000000-0000-4000-8000-000000000001' from desk_state),'Oldest new lead comes first');
select pg_temp.check_ok((select first->'lead'->>'id'=second->'lead'->>'id' from desk_state),'Refresh returns the same current lead');
select pg_temp.check_ok((select first::text !~ '(9777700001|9777700091|9876543210)' and first->'lead'->>'first_name'='Meera' and (first->'lead'->>'has_parent_phone')::boolean from desk_state),'Desk carries no number and only a first name');
select pg_temp.check_ok((select (first->>'target')::int=600 from desk_state),'Default target is 600');

select pg_temp.expect_error($$select public.record_counsellor_action('c0000000-0000-4000-8000-000000000001','{}','no_answer','d0000000-0000-4000-8000-000000000001',null,now()+interval '1 hour')$$,'Call the student before saving an outcome.');
select pg_temp.expect_error($$select public.begin_call_attempt('c0000000-0000-4000-8000-000000000002','student','fake')$$,'This student is not your current lead.');
select pg_temp.expect_error($$select public.record_counsellor_action('c0000000-0000-4000-8000-000000000002','{}','no_answer','d0000000-0000-4000-8000-000000000001',null,now()+interval '1 hour')$$,'This student is not your current lead.');
create temp table attempt_ids(id uuid);
grant select,insert on attempt_ids to authenticated,service_role;
insert into attempt_ids select public.begin_call_attempt('c0000000-0000-4000-8000-000000000001','student','fake');
select pg_temp.expect_error($$select public.begin_call_attempt('c0000000-0000-4000-8000-000000000001','parent','fake')$$,'Finish your current call first.');
select pg_temp.expect_error($$select public.call_contact((select id from attempt_ids))$$,'permission denied%');
select pg_temp.expect_error($$select public.record_call_event('fake','x','fake-1','dialled')$$,'permission denied%');
select pg_temp.check_ok((select count(*)=1 from public.call_attempts),'Caller sees own attempt');

-- Server side: number goes to the provider only.
reset role;
set local role service_role;
select pg_temp.check_ok((select public.call_contact(id)=jsonb_build_object('customer','9777700001','agent','9876543210') from attempt_ids),'Server gets the number for the provider');
select public.record_call_started(id,'fake-1') from attempt_ids;
select pg_temp.expect_error($$select public.call_contact((select id from attempt_ids))$$,'Attempt unavailable');
select pg_temp.check_ok((public.record_call_event('fake','e1','fake-1','dialled')->>'duplicate')::boolean=false,'First event applies');
select pg_temp.check_ok((public.record_call_event('fake','e1','fake-1','dialled')->>'duplicate')::boolean,'Repeated event is ignored');
select public.record_call_event('fake','e2','fake-1','answered');
select public.record_call_event('fake','e3','fake-1','completed',null,95);
select public.record_call_event('fake','e4','fake-1','busy');
select pg_temp.check_ok((select status='completed' and counted and talk_seconds=95 and answered_at is not null from public.call_attempts c join attempt_ids a on a.id=c.id),'Attempt counted once and ended answered');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000c1',true);
select pg_temp.check_ok((select (d->'today'->>'attempts')::int=1 and (d->'today'->>'conversations')::int=1 and (d->'today'->>'answered')::int=1 from (select public.caller_desk() d) x),'Progress counts the attempt and conversation');
create temp table saved as select public.record_counsellor_action('c0000000-0000-4000-8000-000000000001','{"parent_phone":"9777700099","target_course":"MBBS"}','callback','d0000000-0000-4000-8000-000000000002',null,now()+interval '1 day','Call after exam') as r;
grant select on saved to authenticated,service_role;
select pg_temp.check_ok((select (r->>'parent_updated')::boolean and r::text !~ '(9777700001|9777700099|9777700091)' and r->>'student_name'='Meera' from saved),'Outcome saves parent number without echoing it');
select pg_temp.check_ok((select attempt_id=(select id from attempt_ids) from public.call_logs where id='d0000000-0000-4000-8000-000000000002'),'Outcome linked to the call attempt');
select pg_temp.check_ok((public.caller_desk()->'lead'->>'id')='c0000000-0000-4000-8000-000000000002','Saving releases the next lead');

-- Do not contact on the second lead.
select public.begin_call_attempt('c0000000-0000-4000-8000-000000000002','student','fake');
select public.record_counsellor_action('c0000000-0000-4000-8000-000000000002','{}','do_not_contact','d0000000-0000-4000-8000-000000000003');
select pg_temp.check_ok(public.caller_desk()->'lead'='null'::jsonb,'No lead left: callback not due, DNC excluded');

-- Centre Head: reassign, re-import, held leads, activity, audit.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok((select (parent_phone='9777700099') from public.students where id='c0000000-0000-4000-8000-000000000001'),'Head sees the corrected parent number');
update public.students set assigned_to='20000000-0000-4000-8000-000000000004' where id='c0000000-0000-4000-8000-000000000002';
update public.students set assigned_to='20000000-0000-4000-8000-0000000000c1' where id='c0000000-0000-4000-8000-000000000002';
select pg_temp.check_ok((select calling_status='do_not_contact' from public.students where id='c0000000-0000-4000-8000-000000000002'),'Do not contact survives reassignment');
select public.bulk_import_leads('10000000-0000-4000-8000-000000000001','again.csv','[{"row_number":2,"full_name":"Karan Singh","student_phone":"9777700002"},{"row_number":3,"full_name":"Unclear Lead","student_phone":"9777700003"}]','one','{20000000-0000-4000-8000-0000000000c1}','Partner website',current_date,'unknown');
select pg_temp.check_ok((select calling_status='do_not_contact' from public.students where id='c0000000-0000-4000-8000-000000000002'),'Do not contact survives re-import');
select pg_temp.check_ok((select calling_status='held' and consent_basis='unknown' and lead_source='Partner website' and lead_received_on=current_date from public.students where student_phone='9777700003'),'Unclear consent imports as held');
select pg_temp.expect_error($$select public.bulk_import_leads('10000000-0000-4000-8000-000000000001','x.csv','[{"full_name":"A","student_phone":"9777700004"}]','unassigned','{}',null,current_date+2,'direct_enquiry')$$,'Check the lead source and date received');
select pg_temp.check_ok((select (a->>'held_total')::int>=2 and exists(select 1 from jsonb_array_elements(a->'callers') c where c->>'id'='20000000-0000-4000-8000-0000000000c1' and (c->'today'->>'attempts')::int=1) from (select public.caller_activity() a) x),'Head sees held leads and caller progress');
select pg_temp.check_ok(not exists(select 1 from public.audit_logs where entity_type='students' and (details->'before' ?| array['student_phone','parent_phone'] or details->'after' ?| array['student_phone','parent_phone'])),'Audit log holds no student numbers');
select pg_temp.check_ok(exists(select 1 from public.audit_logs where entity_type='call_attempts'),'Call attempts are audited');

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000c1',true);
select pg_temp.check_ok(public.caller_desk()->'lead'='null'::jsonb,'Held lead is never dialled');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select public.set_calling_status(array[(select id from public.students where student_phone='9777700003')],'eligible');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-0000000000c1',true);
select pg_temp.check_ok(public.caller_desk()->'lead'->>'first_name'='Unclear','Released lead enters the queue');

-- Other branches are unchanged.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000005',true);
select pg_temp.check_ok((select count(*)>0 from public.students where student_phone is not null),'Non-secure branch caller works as today');
select pg_temp.expect_error('select public.caller_desk()','Access denied');
rollback;
