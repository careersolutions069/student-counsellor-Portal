begin;
create function pg_temp.check_ok(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'FAILED: %',message; end if; end $$;
update public.students set "F/N"='Fixture parent',city='Patna',state='Bihar',counselling_amount=1000,percentage_or_score='610',marks_type='exact',selected_courses=array['MBBS'],college_type='government',college_pdf_path=branch_id::text||'/'||id::text||'/college-registration/test.pdf',college_pdf_name='test.pdf',visit_details_completed=true where id in ('30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
update public.students set target_course='B.Com',budget_range='2 lakh' where id='30000000-0000-4000-8000-000000000001';
select pg_temp.check_ok(exists(select 1 from public.audit_logs where entity_id='30000000-0000-4000-8000-000000000001' and actor_id=auth.uid() and action='update'),'Academic update audited');
select pg_temp.check_ok(not exists(select 1 from public.audit_logs where branch_id='10000000-0000-4000-8000-000000000002'),'Cross-branch audit invisible');
do $$ begin
 begin insert into public.audit_logs(actor_id,actor_role,action,entity_type,entity_id) values(auth.uid(),'owner','delete','students',gen_random_uuid());raise exception 'FAILED: forged audit allowed';exception when insufficient_privilege then null;end;
 begin update public.audit_logs set action='tampered';raise exception 'FAILED: audit edit allowed';exception when insufficient_privilege then null;end;
 begin insert into public.students(branch_id,full_name,student_phone,parent_phone) values('10000000-0000-4000-8000-000000000001','Duplicate','+91 90000 00003','+91 99999 99999');raise exception 'FAILED: duplicate student phone accepted';exception when unique_violation then null;end;
 begin perform public.transfer_student('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Forbidden');raise exception 'FAILED: head transferred student';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
 begin perform public.update_staff('20000000-0000-4000-8000-000000000004','Caller','centre_head','10000000-0000-4000-8000-000000000001');raise exception 'FAILED: head promoted caller';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
select public.update_staff('20000000-0000-4000-8000-000000000004','Renamed Caller','tele_counsellor','10000000-0000-4000-8000-000000000001');
update public.appointments set status='attended' where student_id='30000000-0000-4000-8000-000000000001';
select pg_temp.check_ok((public.dashboard_kpis('10000000-0000-4000-8000-000000000001')->>'f2f_attended')::int=1,'Attended KPI counts students');
update public.shortlists_and_admissions set admission_status='Admission Confirmed',is_shared=true where student_id='30000000-0000-4000-8000-000000000001';
select pg_temp.check_ok((public.dashboard_kpis(null)->>'admissions_confirmed')::int=1,'Confirmed KPI deduplicates shortlists');
delete from public.shortlists_and_admissions where student_id='30000000-0000-4000-8000-000000000001';
select pg_temp.check_ok(exists(select 1 from public.audit_logs where entity_type='shortlists_and_admissions' and action='delete'),'Shortlist delete audited');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select public.transfer_student('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Family relocation');
set constraints all immediate;
select pg_temp.check_ok(exists(select 1 from public.branch_transfers where student_id='30000000-0000-4000-8000-000000000001' and reason='Family relocation'),'Transfer history recorded');
select pg_temp.check_ok((select registration_number='CS-PAT-2026-0001' and assigned_to is null from public.students where id='30000000-0000-4000-8000-000000000001'),'Transfer preserves registration and clears assignment');
select public.update_staff('20000000-0000-4000-8000-000000000005','Moved caller','tele_counsellor','10000000-0000-4000-8000-000000000001');
select pg_temp.check_ok((select assigned_to is null from public.students where id='30000000-0000-4000-8000-000000000003'),'Staff relocation clears old assignments');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok((select count(*)=1 from public.branch_transfers where reason='Family relocation' and student_id='30000000-0000-4000-8000-000000000001'),'Source head sees transfer record');
select pg_temp.check_ok(not exists(select 1 from public.students where id='30000000-0000-4000-8000-000000000001'),'Source head loses transferred student access');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select pg_temp.check_ok((select count(*)=1 from public.branch_transfers where reason='Family relocation' and student_id='30000000-0000-4000-8000-000000000001'),'Destination head sees transfer record');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select pg_temp.check_ok((select count(*)=0 from public.audit_logs),'Callers cannot read audit logs');
select pg_temp.check_ok((select count(*)=0 from public.branch_transfers),'Callers cannot read transfer history');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
update public.branches set code='PTN' where id='10000000-0000-4000-8000-000000000001';
update public.branches set code='PAT' where id='10000000-0000-4000-8000-000000000002';
select pg_temp.check_ok(public.complete_student_profile('30000000-0000-4000-8000-000000000004','Kabir Shah','9000000004','2007-01-01')<>'CS-PAT-2026-0001','Reused branch code preserves legacy identifiers');
do $$ begin
 begin
  insert into public.students(branch_id,full_name,student_phone) values('10000000-0000-4000-8000-000000000001','Rolled back fixture','9888888888');
  raise exception 'ROLLBACK_FIXTURE';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_FIXTURE' then raise;end if;end;
 if exists(select 1 from public.audit_logs where details->'after'->>'full_name'='Rolled back fixture') then raise exception 'FAILED: audit survived rolled-back mutation';end if;
end $$;
rollback;

-- An empty branch remains deletable and retains an owner-readable audit trail.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
insert into public.branches(id,name,code,city,address) values('90000000-0000-4000-8000-000000000001','Audit deletion fixture','DEL','Patna','Test address');
delete from public.branches where id='90000000-0000-4000-8000-000000000001';
do $$ begin
 if not exists(select 1 from public.audit_logs where entity_id='90000000-0000-4000-8000-000000000001' and action='delete' and details->'before'->>'code'='DEL') then raise exception 'FAILED: branch deletion history missing';end if;
end $$;
rollback;
