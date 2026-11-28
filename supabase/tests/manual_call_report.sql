begin;
update public.branches set secure_calling=true,manual_calling=true where id='10000000-0000-4000-8000-000000000001';
insert into public.students(id,branch_id,assigned_to,full_name,student_phone,pipeline_stage,next_call_at)
values('00000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Manual QA','9840000901','New Enquiry',now());
delete from private.caller_current_lead where caller_id='20000000-0000-4000-8000-000000000004';
insert into private.caller_current_lead(caller_id,student_id) values('20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000901');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
do $$
declare d jsonb:=public.manual_desk(); caller uuid:=auth.uid(); day date:=timezone('Asia/Kolkata',now())::date;
 id uuid:=(d->'lead'->>'id')::uuid; stamp timestamptz:=(d->'lead'->>'assignment')::timestamptz; token uuid:=gen_random_uuid(); r jsonb; baseline int;
begin
 if d->'lead'->>'phone' is distinct from '9840000901' then raise exception 'Expected single assigned phone'; end if;
 baseline=(d->>'total')::int;
 perform public.save_manual_call(id,stamp,token,'busy','Private call note',null);
 perform public.save_manual_call(id,stamp,token,'busy','Private call note',null);
 if (public.manual_desk()->>'total')::int<>baseline+1 then raise exception 'Repeat counted twice'; end if;
 perform public.save_daily_call_note(day,'Shared daily note');
 r=public.daily_call_report(caller,day);
 if r->>'note'<>'Shared daily note' or r::text like '%9840000901%' or r::text like '%Private call note%' then raise exception 'Report leak or note missing'; end if;
 perform public.manual_followup(token,null);
 d=public.manual_desk();
 if d->'lead'->>'id' is distinct from id::text or (d->>'total')::int<>baseline then raise exception 'Undo failed'; end if;
 perform public.save_manual_call(id,(d->'lead'->>'assignment')::timestamptz,gen_random_uuid(),'no_answer','',null);
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
do $$begin
 begin perform public.daily_call_report('20000000-0000-4000-8000-000000000004',current_date);raise exception 'Foreign report visible';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
reset role;
update public.branches set manual_calling=false where id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
do $$begin
 begin perform public.manual_desk();raise exception 'Masked mode released phone';exception when raise_exception then if sqlerrm<>'Manual desk unavailable' then raise;end if;end;
end $$;
rollback;
