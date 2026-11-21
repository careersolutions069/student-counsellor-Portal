update storage.buckets set file_size_limit=4194304 where id='student-documents';

-- Limit new college PDFs; retaining an existing file does not upload it again.
create or replace function public.save_visit_details(target uuid,details jsonb,expected_branch uuid,expected_pdf_path text,expected_college_type text,new_pdf_path text default null,new_pdf_name text default null) returns text language plpgsql security definer set search_path='' as $$
declare s public.students; courses text[]; amount numeric; path text; filename text;
begin
 select * into s from public.students where id=target for update;
 if s.id is null or not public.can_manage_branch(s.branch_id) then raise exception 'Access denied'; end if;
 if s.branch_id is distinct from expected_branch or s.college_pdf_path is distinct from expected_pdf_path or s.college_type is distinct from expected_college_type then raise exception 'Visit changed; refresh before saving'; end if;
 if jsonb_typeof(details) is distinct from 'object' then raise exception 'Visit details required'; end if;
 if exists(select 1 from unnest(array['full_name','F/N','city','state','percentage_or_score']) f where coalesce(length(trim(details->>f)),0) not between 1 and 150) then raise exception 'Name, F/N, city, state and marks are required'; end if;
 if details->>'counselling_amount' is null or details->>'counselling_amount' !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Positive amount with up to two decimals required'; end if;
 amount=(details->>'counselling_amount')::numeric;
 if amount<=0 or amount>9999999999.99 then raise exception 'Positive amount within range required'; end if;
 if coalesce(details->>'marks_type','') not in ('exact','approximate') or coalesce(details->>'college_type','') not in ('government','private') then raise exception 'Marks type and college type required'; end if;
 if jsonb_typeof(details->'selected_courses') is distinct from 'array' then raise exception 'Select one or more courses'; end if;
 courses=array(select jsonb_array_elements_text(details->'selected_courses'));
 if cardinality(courses) not between 1 and 3 or not courses<@array['MBBS','BDS','BAMS']::text[] or cardinality(courses)<>(select count(distinct c) from unnest(courses) c) then raise exception 'Select distinct MBBS, BDS or BAMS courses'; end if;
 if new_pdf_path is null then
  if s.college_pdf_path is null or s.college_type is distinct from details->>'college_type' then raise exception 'Upload a new PDF for the selected college type'; end if;
  path=s.college_pdf_path;filename=s.college_pdf_name;
 else
  if new_pdf_path is not distinct from s.college_pdf_path or new_pdf_path !~ ('^'||s.branch_id::text||'/'||s.id::text||'/college-registration/[0-9a-f-]+\.pdf$') or coalesce(length(new_pdf_name),0) not between 1 and 180 then raise exception 'Invalid college PDF'; end if;
  path=new_pdf_path;filename=new_pdf_name;
 end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='student-documents' and o.name=path and o.metadata->>'mimetype'='application/pdf' and (o.metadata->>'size')::bigint>0 and (new_pdf_path is null or (o.metadata->>'size')::bigint<=4194304)) then raise exception 'Uploaded PDF unavailable'; end if;
 update public.students set full_name=trim(details->>'full_name'),"F/N"=trim(details->>'F/N'),student_phone=public.normalize_phone(details->>'student_phone'),city=trim(details->>'city'),state=trim(details->>'state'),counselling_amount=amount,percentage_or_score=trim(details->>'percentage_or_score'),marks_type=details->>'marks_type',selected_courses=courses,target_course=array_to_string(courses,', '),college_type=details->>'college_type',college_pdf_path=path,college_pdf_name=filename,visit_details_completed=true where id=target;
 return case when new_pdf_path is not null then s.college_pdf_path else null end;
end$$;
