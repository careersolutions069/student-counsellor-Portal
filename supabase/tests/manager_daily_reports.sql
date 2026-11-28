begin;
update public.branches set secure_calling=true, manual_calling=true
where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');

insert into private.manual_calls(id,caller_id,branch_id,day,status,file_name,campaign,previous_state,saved_state,undone)
select gen_random_uuid(),'20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',
       date '2047-03-01','interested','Pilot.xlsx','Round 1','{}','{}',reverted
from unnest(array[false,false,true]) as reverted;
insert into private.caller_daily_notes values
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','2047-03-01','Patna daily note');

set local role authenticated;
do $$
declare
  patna uuid:='10000000-0000-4000-8000-000000000001';
  bangalore uuid:='10000000-0000-4000-8000-000000000002';
  day date:='2047-03-01';
  reports jsonb;
begin
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
  reports:=public.manager_daily_reports(day);
  assert reports @> '[{"id":"20000000-0000-4000-8000-000000000004","groups":[{"status":"interested","count":2}],"note":"Patna daily note"}]';
  assert reports @> '[{"id":"20000000-0000-4000-8000-000000000005","groups":[]}]';
  assert not public.manager_daily_reports(day,bangalore) @> jsonb_build_array(jsonb_build_object('branchId',patna));
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
  reports:=public.manager_daily_reports(day);
  assert reports @> jsonb_build_array(jsonb_build_object('branchId',bangalore));
  assert not reports @> jsonb_build_array(jsonb_build_object('branchId',patna));
  begin
    perform public.manager_daily_reports(day,patna);
    raise exception 'Foreign branch filter accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
  begin
    perform public.manager_daily_reports(day);
    raise exception 'Caller could read the management overview';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
