alter policy staff_insert on public.staff_profiles
with check (
  public.my_role() = 'owner'
  or (
    public.my_role() = 'centre_head'
    and role in ('centre_head', 'tele_counsellor')
    and branch_id = public.my_branch()
  )
);
