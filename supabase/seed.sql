-- Local development fixtures only. All five staff passwords are CareerDemo!2026.
insert into public.branches(id,name,code,city,address,google_maps_url) values
 ('10000000-0000-4000-8000-000000000001','Patna','PAT','Patna','Boring Road, Patna, Bihar','https://www.google.com/maps/search/?api=1&query=Boring+Road+Patna'),
 ('10000000-0000-4000-8000-000000000002','Bangalore','BLR','Bangalore','Indiranagar, Bangalore, Karnataka','https://www.google.com/maps/search/?api=1&query=Indiranagar+Bangalore');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change) select
 '00000000-0000-0000-0000-000000000000',id::uuid,'authenticated','authenticated',email,extensions.crypt('CareerDemo!2026',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),'','','',''
 from (values
 ('20000000-0000-4000-8000-000000000001','owner@career.test'),
 ('20000000-0000-4000-8000-000000000002','patna.head@career.test'),
 ('20000000-0000-4000-8000-000000000003','bangalore.head@career.test'),
 ('20000000-0000-4000-8000-000000000004','patna.caller@career.test'),
 ('20000000-0000-4000-8000-000000000005','bangalore.caller@career.test')) as fixture(id,email);
insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
 select gen_random_uuid(),id,id::text,jsonb_build_object('sub',id::text,'email',email,'email_verified',true),'email',now(),now() from auth.users where email like '%@career.test';
insert into public.staff_profiles(id,full_name,email,role,branch_id) values
 ('20000000-0000-4000-8000-000000000001','Aman Singh','owner@career.test','owner',null),
 ('20000000-0000-4000-8000-000000000002','Priya Sharma','patna.head@career.test','centre_head','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000003','Arjun Rao','bangalore.head@career.test','centre_head','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000004','Neha Kumari','patna.caller@career.test','tele_counsellor','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000005','Rohan Mehta','bangalore.caller@career.test','tele_counsellor','10000000-0000-4000-8000-000000000002');
insert into public.students(id,branch_id,assigned_to,full_name,student_phone,parent_phone,dob,registration_number,is_profile_complete,lead_source,pipeline_stage) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Aditi Verma','9000000001','9100000001','2007-05-12','CS-PAT-2026-0001',true,'Referral','Counselling'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',null,'Rahul Kumar','9000000002',null,null,null,false,'Walk-in','New Enquiry'),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000005','Ishita Nair','9000000003','9100000003','2006-08-23','CS-BLR-2026-0001',true,'Website','Meeting Scheduled'),
 ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002',null,'Kabir Shah','9000000004',null,null,null,false,'Referral','New Enquiry');
insert into private.registration_counters values ('10000000-0000-4000-8000-000000000001',2026,1),('10000000-0000-4000-8000-000000000002',2026,1);
insert into public.appointments(student_id,branch_id,scheduled_at,created_by) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',now()+interval '2 days','20000000-0000-4000-8000-000000000004'),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002',now()+interval '3 days','20000000-0000-4000-8000-000000000005');
insert into public.call_logs(student_id,branch_id,logged_by,outcome,remarks) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Connected','INTERNAL ONLY: Discuss preferences at the meeting.');
insert into public.shortlists_and_admissions(student_id,branch_id,college_name,course_name,fees_estimate,document_status,admission_status,is_shared) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Sample College, Patna','B.Com','To be confirmed',E'Class 10 marksheet — received\nClass 12 marksheet — pending','Shortlisted',true),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Sample College, Bangalore','B.Tech','To be confirmed','Class 12 marksheet — pending','Counselling scheduled',true),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','INTERNAL DRAFT COLLEGE','Draft course',null,null,'Under review',false);
