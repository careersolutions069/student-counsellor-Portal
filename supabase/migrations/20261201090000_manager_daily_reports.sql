-- Include zero-activity callers and retain activity under the branch where it was logged.
create index manual_calls_branch_report_day on private.manual_calls(day, branch_id, caller_id)
where not undone;

create function public.manager_daily_reports(report_day date, selected_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor public.staff_profiles := private.current_staff();
  scope uuid := selected_branch;
begin
  if actor.id is null or actor.role not in ('owner','centre_head') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if actor.role='centre_head' then
    if actor.branch_id is null or (scope is not null and scope <> actor.branch_id) then
      raise exception 'Access denied' using errcode='42501';
    end if;
    scope := actor.branch_id;
  end if;

  return (
    with counts as (
      select caller_id, branch_id, file_name as file, campaign, status, count(*) as count
      from private.manual_calls
      where day=report_day and not undone and (scope is null or branch_id=scope)
      group by caller_id,branch_id,file_name,campaign,status
    ), activity as (
      select caller_id,branch_id,jsonb_agg(jsonb_build_object('file',file,'campaign',campaign,'status',status,'count',count)
        order by file,campaign,status) as groups
      from counts group by caller_id,branch_id
    ), notes as (
      select caller_id,branch_id,note from private.caller_daily_notes
      where day=report_day and note<>'' and (scope is null or branch_id=scope)
    ), roster as (
      select p.id as caller_id,p.branch_id from public.staff_profiles p join public.branches b on b.id=p.branch_id
      where p.is_active and p.role='tele_counsellor' and b.manual_calling
        and (scope is null or p.branch_id=scope)
      union select caller_id,branch_id from activity
      union select caller_id,branch_id from notes
    ), heads as (
      select branch_id,string_agg(email,',' order by email) as recipient from public.staff_profiles
      where role='centre_head' and is_active and (scope is null or branch_id=scope) group by branch_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.full_name,'branchId',b.id,'branch',b.name,'target',p.daily_attempt_target,
      'date',report_day,'groups',coalesce(a.groups,'[]'::jsonb),'note',coalesce(n.note,''),'recipient',h.recipient
    ) order by b.name,p.full_name,p.id),'[]'::jsonb)
    from roster r join public.staff_profiles p on p.id=r.caller_id join public.branches b on b.id=r.branch_id
    left join activity a on a.caller_id=r.caller_id and a.branch_id=r.branch_id
    left join notes n on n.caller_id=r.caller_id and n.branch_id=r.branch_id
    left join heads h on h.branch_id=r.branch_id
  );
end $$;
revoke all on function public.manager_daily_reports(date,uuid) from public, anon, authenticated;
grant execute on function public.manager_daily_reports(date,uuid) to authenticated;
