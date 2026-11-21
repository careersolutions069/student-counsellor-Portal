create index if not exists idx_students_branch_created on public.students(branch_id,created_at desc);
-- students_assigned_to_idx already indexes assigned_to alone.
create index if not exists idx_appointments_branch_status on public.appointments(branch_id,status);
create index if not exists idx_counselling_branch_allotted on public.student_counselling(branch_id,allotted_phase);

create function public.bulk_import_leads(target_branch uuid,file_name text,lead_rows jsonb,assignment_mode text,caller_ids uuid[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.staff_profiles;b public.branches;item jsonb;position bigint;row_no int;name text;phone text;parent text;reason text;status text;new_id uuid;assignee uuid;seen text[]='{}';imported int=0;duplicates int=0;invalid int=0;warnings int=0;warning boolean;results jsonb='[]';summary jsonb;
begin
 select * into actor from public.staff_profiles where id=auth.uid() and is_active for share;
 if actor.id is null or actor.role not in ('owner','centre_head') or (actor.role='centre_head' and target_branch is distinct from actor.branch_id) then raise exception 'Access denied';end if;
 select * into b from public.branches where id=target_branch and is_active for update;
 if b.id is null then raise exception 'Select an active branch';end if;
 if file_name is null or length(trim(file_name)) not between 1 and 180 or jsonb_typeof(lead_rows) is distinct from 'array' then raise exception 'Invalid import';end if;
 if jsonb_array_length(lead_rows) not between 1 and 5000 then raise exception 'Import 1 to 5000 lead rows at a time';end if;
 if assignment_mode is null or assignment_mode not in ('round_robin','one','unassigned') or caller_ids is null or array_position(caller_ids,null) is not null or cardinality(caller_ids)<>(select count(distinct v) from unnest(caller_ids) v) or (assignment_mode='one' and cardinality(caller_ids)<>1) or (assignment_mode='round_robin' and cardinality(caller_ids)=0) or (assignment_mode='unassigned' and cardinality(caller_ids)<>0) then raise exception 'Choose a valid assignment option';end if;
 perform 1 from public.staff_profiles where id=any(caller_ids) and branch_id=target_branch and role='tele_counsellor' and is_active order by id for share;
 if (select count(*) from public.staff_profiles where id=any(caller_ids) and branch_id=target_branch and role='tele_counsellor' and is_active)<>cardinality(caller_ids) then raise exception 'Choose active tele-counsellors from this branch';end if;
 for item,position in select value,ordinality from jsonb_array_elements(lead_rows) with ordinality loop
  row_no=case when (item->>'row_number') ~ '^[1-9][0-9]{0,5}$' then (item->>'row_number')::int else position::int+1 end;
  reason=null;status='imported';new_id=null;phone=null;parent=null;name=trim(item->>'full_name');
  begin
   if jsonb_typeof(item)<>'object' or name is null or length(name) not between 1 and 150 then raise exception 'Student Name is required (max 150 characters).';end if;
   if item->>'status'='invalid' then raise exception '%',left(coalesce(item->>'reason','Invalid row.'),500);end if;
   phone=public.normalize_phone(item->>'student_phone');parent=public.normalize_phone(nullif(trim(item->>'parent_phone'),''));
   if phone is null then raise exception 'Enter a valid 10-digit Student Phone.';end if;
   if exists(select 1 from jsonb_each_text(item) f where f.key in ('lead_source','target_course','academic_stream','percentage_or_score','city','state') and length(f.value)>500) then raise exception 'Keep each field to 500 characters or fewer.';end if;
  exception when raise_exception or invalid_parameter_value then reason=sqlerrm;status='invalid';invalid=invalid+1;end;
  if status='imported' then
   if phone=any(seen) then status='duplicate';reason='Duplicate Student Phone within file.';duplicates=duplicates+1;
   else
    seen=array_append(seen,phone);
    assignee=case when assignment_mode='unassigned' then null else caller_ids[1+(imported%cardinality(caller_ids))] end;
    warning=parent is not null and exists(select 1 from public.students where branch_id=target_branch and parent_phone=parent);
    insert into public.students(branch_id,assigned_to,full_name,student_phone,parent_phone,lead_source,target_course,academic_stream,percentage_or_score,city,state,pipeline_stage,next_call_at)
    values(target_branch,assignee,name,phone,parent,nullif(trim(item->>'lead_source'),''),nullif(trim(item->>'target_course'),''),nullif(trim(item->>'academic_stream'),''),nullif(trim(item->>'percentage_or_score'),''),nullif(trim(item->>'city'),''),nullif(trim(item->>'state'),''),'New Enquiry',case when assignee is not null then clock_timestamp() else null end)
    on conflict(student_phone) do nothing returning id into new_id;
    if new_id is null then status='duplicate';reason='Student Phone already registered.';duplicates=duplicates+1;
    else imported=imported+1;reason=case when warning then 'Imported. Parent Phone is shared with another lead in this branch.' else 'Imported.' end;if warning then warnings=warnings+1;end if;end if;
   end if;
  end if;
  results=results||jsonb_build_array(jsonb_build_object('row_number',row_no,'status',status,'reason',reason));
 end loop;
 summary=jsonb_build_object('file_name',file_name,'imported_count',imported,'duplicate_count',duplicates,'invalid_count',invalid,'parent_warning_count',warnings);
 insert into public.audit_logs(actor_id,actor_role,branch_id,action,entity_type,entity_id,details) values(actor.id,actor.role,target_branch,'bulk_lead_import','lead_import',gen_random_uuid(),summary);
 return summary||jsonb_build_object('rows',results);
end$$;
revoke execute on function public.bulk_import_leads(uuid,text,jsonb,text,uuid[]) from public,anon;
grant execute on function public.bulk_import_leads(uuid,text,jsonb,text,uuid[]) to authenticated;

create function public.owner_conversion_report(selected_branch uuid default null,start_at timestamptz default null,end_at timestamptz default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.staff_profiles where id=auth.uid() and role='owner' and is_active) then raise exception 'Owner access required';end if;
 if start_at is not null and end_at is not null and start_at>=end_at then raise exception 'Invalid date range';end if;
 if selected_branch is not null and not exists(select 1 from public.branches where id=selected_branch) then raise exception 'Invalid branch';end if;
 with branches as materialized(select id,name,code from public.branches where is_active and (selected_branch is null or id=selected_branch)),
 leads as materialized(
  select s.id,s.branch_id,s.assigned_to,s.registration_number,s.counselling_amount,c.allotted_phase,c.student_id is not null as in_counselling,
   exists(select 1 from public.appointments a where a.student_id=s.id) as invited,
   (s.visit_details_completed or exists(select 1 from public.appointments a where a.student_id=s.id and a.status in ('attended','completed'))) as attended
  from public.students s join branches b on b.id=s.branch_id left join public.student_counselling c on c.student_id=s.id
  where (start_at is null or s.created_at>=start_at) and (end_at is null or s.created_at<end_at)
 ),
 branch_rows as materialized(
  select b.id as branch_id,b.name,b.code,count(s.id) as enquiries,count(s.id) filter(where s.invited) as invited,count(s.id) filter(where s.attended) as attended,count(s.id) filter(where s.registration_number is not null) as registered,count(s.id) filter(where s.allotted_phase is not null) as allotted,coalesce(sum(s.counselling_amount),0) as amount
  from branches b left join leads s on s.branch_id=b.id group by b.id,b.name,b.code
 ),
 caller_assigned as(select assigned_to,count(*) as total from leads where assigned_to is not null group by assigned_to),
 caller_calls as(select c.logged_by,count(*) as total from public.call_logs c join leads s on s.id=c.student_id group by c.logged_by),
 caller_invites as(select a.created_by,count(distinct s.id) as invites,count(distinct s.id) filter(where a.status in ('attended','completed')) as attended from public.appointments a join leads s on s.id=a.student_id group by a.created_by),
 caller_rows as(
  select p.id,p.full_name as name,b.name as branch,p.is_active,coalesce(a.total,0) as assigned,coalesce(c.total,0) as calls,coalesce(i.invites,0) as invites,coalesce(i.attended,0) as attended
  from public.staff_profiles p join branches b on b.id=p.branch_id left join caller_assigned a on a.assigned_to=p.id left join caller_calls c on c.logged_by=p.id left join caller_invites i on i.created_by=p.id where p.role='tele_counsellor'
 ),
 doc_counts as(select count(distinct d.student_id) filter(where d.doc_category='new_choice_pdf') as new_choices,count(distinct d.student_id) filter(where d.doc_category='new_allotment_letter') as new_allotments,count(distinct d.student_id) filter(where d.doc_category='upgrade_choice_pdf') as upgrade_choices,count(distinct d.student_id) filter(where d.doc_category='upgraded_allotment_letter') as upgrade_allotments from public.counselling_documents d join leads s on s.id=d.student_id)
 select jsonb_build_object(
 'branches',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('amount',r.amount::text) order by r.name,r.branch_id) from branch_rows r),'[]'),
 'total',(select jsonb_build_object('branch_id',null,'name','All-India Total','code','ALL','enquiries',coalesce(sum(enquiries),0),'invited',coalesce(sum(invited),0),'attended',coalesce(sum(attended),0),'registered',coalesce(sum(registered),0),'allotted',coalesce(sum(allotted),0),'amount',coalesce(sum(amount),0)::text) from branch_rows),
 'callers',coalesce((select jsonb_agg(to_jsonb(r) order by r.branch,r.name,r.id) from caller_rows r),'[]'),
 'phases',(select jsonb_agg((select count(*) from leads where allotted_phase=phase) order by phase) from generate_series(1,6) phase),
 'in_counselling',(select count(*) from leads where in_counselling and allotted_phase is null),
 'new_choices',new_choices,'new_allotments',new_allotments,'upgrade_choices',upgrade_choices,'upgrade_allotments',upgrade_allotments) into result from doc_counts;
 return result;
end$$;
revoke execute on function public.owner_conversion_report(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.owner_conversion_report(uuid,timestamptz,timestamptz) to authenticated;
