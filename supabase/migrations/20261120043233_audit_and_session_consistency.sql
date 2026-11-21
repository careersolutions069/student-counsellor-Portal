-- Retain historical branch details when an otherwise empty branch is deleted.
alter table public.audit_logs drop constraint audit_logs_branch_id_fkey;
alter table public.audit_logs add constraint audit_logs_branch_id_fkey foreign key(branch_id) references public.branches(id) on delete set null;

create or replace function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; event_branch uuid; actor public.staff_profiles;
begin
 if tg_op<>'INSERT' then before_row=to_jsonb(old); end if;
 if tg_op<>'DELETE' then after_row=to_jsonb(new); end if;
 row_data=coalesce(after_row,before_row);
 select * into actor from public.staff_profiles where id=auth.uid();
 event_branch=case when tg_table_name='branches' then case when tg_op='DELETE' then null else (row_data->>'id')::uuid end when tg_table_name='branch_transfers' then (row_data->>'to_branch_id')::uuid else (row_data->>'branch_id')::uuid end;
 insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
 values(actor.id,coalesce(actor.role,'system'),event_branch,lower(tg_op),tg_table_name,(row_data->>'id')::uuid,jsonb_build_object('before',before_row,'after',after_row));
 if tg_op='UPDATE' and before_row->>'branch_id' is distinct from after_row->>'branch_id' and before_row->>'branch_id' is not null then
  insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details)
  values(actor.id,coalesce(actor.role,'system'),(before_row->>'branch_id')::uuid,'update',tg_table_name,(row_data->>'id')::uuid,jsonb_build_object('before',before_row,'after',after_row));
 end if;
 return coalesce(new,old);
end $$;

-- Serialize successful login with profile changes and session invalidation.
create or replace function public.student_login(reg text, birth_date date, ip_hash text, session_hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare reg_key text:='reg:'||upper(trim(reg)); ip_key text:='ip:'||ip_hash; s public.students;
begin
 -- Sorted locks serialize attempts across both shared registration numbers and shared IPs.
 perform pg_advisory_xact_lock(hashtextextended(least(reg_key,ip_key),0));
 perform pg_advisory_xact_lock(hashtextextended(greatest(reg_key,ip_key),0));
 delete from private.student_sessions where expires_at<now();
 insert into private.login_attempts(key) values(reg_key),(ip_key) on conflict do nothing;
 update private.login_attempts set failures=0,window_start=now() where key in(reg_key,ip_key) and window_start<=now()-interval '15 minutes';
 if exists(select 1 from private.login_attempts where key in(reg_key,ip_key) and failures>=5) then return jsonb_build_object('error','Too many attempts. Try again in 15 minutes.'); end if;
 select * into s from public.students where upper(registration_number)=upper(trim(reg)) and dob=birth_date and is_profile_complete and exists(select 1 from public.branches b where b.id=branch_id and b.is_active) for share;
 if s.id is null then
  update private.login_attempts set failures=failures+1 where key in(reg_key,ip_key);
  return jsonb_build_object('error','Registration number or date of birth is incorrect.');
 end if;
 insert into private.student_sessions values(session_hash,s.id,now()+interval '8 hours');
 return jsonb_build_object('student_id',s.id);
end $$;
