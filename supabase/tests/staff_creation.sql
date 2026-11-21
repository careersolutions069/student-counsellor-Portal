-- Run against local seed fixtures. Every write rolls back.
begin;
insert into auth.users(id,email) values
 ('60000000-0000-4000-8000-000000000001','new.head@career.test'),
 ('60000000-0000-4000-8000-000000000002','new.caller@career.test'),
 ('60000000-0000-4000-8000-000000000003','blocked.staff@career.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
insert into public.staff_profiles(id,full_name,email,role,branch_id) values
 ('60000000-0000-4000-8000-000000000002','New Caller','new.caller@career.test','tele_counsellor','10000000-0000-4000-8000-000000000001');
do $$ begin
 update public.staff_profiles set is_active=false where id='20000000-0000-4000-8000-000000000002';
 if found then raise exception 'FAILED: Centre Head deactivated a Centre Head'; end if;
 if not exists(select 1 from public.staff_profiles where id='60000000-0000-4000-8000-000000000002') then raise exception 'FAILED: same-branch caller creation'; end if;
 begin
  insert into public.staff_profiles(id,full_name,email,role,branch_id) values('60000000-0000-4000-8000-000000000001','Blocked Head','new.head@career.test','centre_head','10000000-0000-4000-8000-000000000001');
  raise exception 'FAILED: Centre Head created another Centre Head';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.staff_profiles(id,full_name,email,role,branch_id) values('60000000-0000-4000-8000-000000000003','Blocked','blocked.staff@career.test','centre_head','10000000-0000-4000-8000-000000000002');
  raise exception 'FAILED: cross-branch Centre Head creation allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.staff_profiles(id,full_name,email,role,branch_id) values('60000000-0000-4000-8000-000000000003','Blocked','blocked.staff@career.test','tele_counsellor','10000000-0000-4000-8000-000000000002');
  raise exception 'FAILED: cross-branch caller creation allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.staff_profiles(id,full_name,email,role,branch_id) values('60000000-0000-4000-8000-000000000003','Blocked','blocked.staff@career.test','owner',null);
  raise exception 'FAILED: Centre Head created an owner';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
do $$ begin
 begin
  insert into public.staff_profiles(id,full_name,email,role,branch_id) values('60000000-0000-4000-8000-000000000003','Blocked','blocked.staff@career.test','tele_counsellor','10000000-0000-4000-8000-000000000001');
  raise exception 'FAILED: caller created staff';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
insert into public.staff_profiles(id,full_name,email,role,branch_id) values('60000000-0000-4000-8000-000000000003','Owner-created Head','blocked.staff@career.test','centre_head','10000000-0000-4000-8000-000000000002');
rollback;
