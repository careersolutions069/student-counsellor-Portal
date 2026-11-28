// Local seeded database and Next dev server only, with CALL_PROVIDER=fake in .env.local.
// Walks a secure-branch caller through call, outcome and invite, and checks no response carries a number.
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServerClient} from '@supabase/ssr';
const {encodeReply}=createRequire(import.meta.url)('next/dist/compiled/react-server-dom-webpack/client.node');
process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Local only');
assert.equal(process.env.CALL_PROVIDER,'fake','Set CALL_PROVIDER=fake in .env.local');
const site='http://localhost:3000';
const branch='10000000-0000-4000-8000-000000000001';
const callerId=randomUUID(),email=`secure-${callerId}@career.test`,password=`Qa!${randomUUID()}`;
const studentId=randomUUID(),studentPhone='9777700301',parentPhone='9777700391',newParent='9777700392',workPhone='9777700399';
const numbers=[studentPhone,parentPhone,newParent,workPhone];
function sql(query){return execFileSync('docker',['exec','-i','supabase_db_careerSolutions','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt','-c',query],{encoding:'utf8',stdio:'pipe'}).trim();}
function staff(){
 const jar=new Map();
 const client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});
 return {client,cookie:()=>Array.from(jar,([name,value])=>`${name}=${value}`).join('; ')};
}
function clean(text,label){for(const n of numbers)assert.ok(!text.includes(n)&&!text.includes(`${n.slice(0,5)} ${n.slice(5)}`),`${label} must not contain a phone number`);return text;}
const wasSecure=sql(`select secure_calling from public.branches where id='${branch}'`)==='t';
const caller=staff(),head=staff();
let created=false;
try{
 assert.equal(Number(sql(`select count(*) from public.students where student_phone in ('${studentPhone}','${parentPhone}','${newParent}') or parent_phone in ('${parentPhone}','${newParent}')`)),0,'Fixture numbers must be unused');
 sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
  values('00000000-0000-0000-0000-000000000000','${callerId}','authenticated','authenticated','${email}',extensions.crypt('${password}',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
  insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at) values(gen_random_uuid(),'${callerId}','${callerId}',jsonb_build_object('sub','${callerId}','email','${email}'),'email',now(),now());
  insert into public.staff_profiles(id,full_name,email,role,branch_id,work_phone) values('${callerId}','QA Secure Caller','${email}','tele_counsellor','${branch}','${workPhone}');
  insert into public.students(id,branch_id,assigned_to,full_name,student_phone,parent_phone,pipeline_stage,target_course,lead_source,calling_status) values('${studentId}','${branch}','${callerId}','Sanvi Raj Kumari','${studentPhone}','${parentPhone}','New Enquiry','MBBS','QA list','eligible');
  update public.branches set secure_calling=true where id='${branch}';`);
 created=true;
 assert.ok(!(await caller.client.auth.signInWithPassword({email,password})).error,'Caller login');
 assert.ok(!(await head.client.auth.signInWithPassword({email:'patna.head@career.test',password:'CareerDemo!2026'})).error,'Head login');

 // Desk page: one student, first name only, no number anywhere in the HTML.
 let page=await fetch(`${site}/counsellor`,{headers:{cookie:caller.cookie()}});
 assert.equal(page.status,200);
 let html=clean(await page.text(),'Desk page');
 assert.match(html,/Sanvi/);assert.doesNotMatch(html,/Raj Kumari/,'Only the first name is sent');assert.doesNotMatch(html,/tel:|wa\.me/,'No dial or WhatsApp links');

 // Direct database access from the browser session finds nothing.
 assert.deepEqual((await caller.client.from('students').select('student_phone,parent_phone')).data,[],'Table read is empty');
 assert.deepEqual((await caller.client.from('caller_student_records').select('*')).data,[],'Caller view is empty');
 assert.ok((await caller.client.rpc('parent_phone_in_branch',{phone:parentPhone})).error,'Parent lookup blocked');
 assert.ok((await caller.client.rpc('call_contact',{attempt:randomUUID()})).error,'Contact lookup is server only');
 assert.equal((await caller.client.rpc('counsellor_queue',{queue_name:'to_call',page_number:1})).data.total,0,'Old queue is empty');
 assert.deepEqual((await caller.client.from('audit_logs').select('id')).data,[],'Audit log hidden from caller');

 const manifest=JSON.parse(await readFile('.next/dev/server/server-reference-manifest.json','utf8')).node;
 const action=name=>{const key=Object.entries(manifest).find(([,v])=>v.exportedName===name)?.[0];assert.ok(key,`${name} compiled`);return key;};
 async function invoke(name,args){
  const response=await fetch(`${site}/counsellor`,{method:'POST',headers:{'Next-Action':action(name),origin:site,cookie:caller.cookie()},body:await encodeReply(args)});
  assert.equal(response.status,200,`${name} HTTP status`);
  return clean(await response.text(),name);
 }

 const started=await invoke('startCall',[studentId,'student']);
 const attemptId=sql(`select id from public.call_attempts where caller_id='${callerId}' order by requested_at desc limit 1`);
 assert.ok(started.includes(attemptId)&&started.includes('ringing'),'Call placed and dialled');
 assert.match(await invoke('startCall',[studentId,'parent']),/Finish your current call first/);

 // Signed provider webhook; a repeat is applied once; a bad signature is refused.
 const body=JSON.stringify({events:[{eventId:`qa-${attemptId}-a`,providerCallId:`fake-${attemptId}`,status:'answered'},{eventId:`qa-${attemptId}-c`,providerCallId:`fake-${attemptId}`,status:'completed',talkSeconds:75}]});
 const sign=b=>createHmac('sha256',process.env.CALL_WEBHOOK_SECRET).update(b).digest('hex');
 for(let i=0;i<2;i++)assert.equal((await fetch(`${site}/api/calls/webhook/fake`,{method:'POST',headers:{'x-fake-signature':sign(body)},body})).status,200,'Webhook accepted');
 assert.equal((await fetch(`${site}/api/calls/webhook/fake`,{method:'POST',headers:{'x-fake-signature':'0'.repeat(64)},body})).status,401,'Bad signature refused');
 assert.equal((await fetch(`${site}/api/calls/webhook/other`,{method:'POST',body})).status,404,'Unknown provider refused');
 assert.equal(sql(`select status||':'||counted||':'||talk_seconds from public.call_attempts where id='${attemptId}'`),'completed:true:75','Attempt counted once with talk time');
 assert.equal(Number(sql(`select count(*) from private.call_events where attempt_id='${attemptId}'`)),3,'Each event stored once');

 // Outcome: book a visit and add a parent number. Nothing comes back but ids and flags.
 const form=new FormData();
 form.set('student_id',studentId);form.set('request_id',randomUUID());form.set('outcome','invite');
 form.set('scheduled_at',new Date(Date.now()+2*86400000).toISOString().replace('Z','+00:00'));
 for(const [k,v] of Object.entries({target_course:'MBBS',percentage_or_score:'612',academic_stream:'PCB',preferred_locations:'Patna',budget_range:'8 lakh',city:'Patna',state:'Bihar',parent_phone:newParent,remarks:'Wants a Saturday visit'}))form.set(k,v);
 const saved=await invoke('saveSecureOutcome',[{},form]);
 assert.match(saved,/"parent_updated":true/);
 assert.equal(sql(`select parent_phone from public.students where id='${studentId}'`),newParent,'Parent number saved');
 const appointmentId=sql(`select id from public.appointments where student_id='${studentId}' and status='scheduled'`);
 assert.ok(saved.includes(appointmentId),'Visit returned');
 assert.equal(sql(`select attempt_id from public.call_logs where student_id='${studentId}'`),attemptId,'Outcome linked to the attempt');

 assert.match(await invoke('sendVisitInvite',[appointmentId]),/Invite sent from the company WhatsApp number/);
 assert.equal(sql(`select status from public.invite_messages where appointment_id='${appointmentId}'`),'sent','Invite recorded without a number');
 assert.equal(Number(sql(`select count(*) from public.invite_messages where appointment_id='${appointmentId}' and to_jsonb(invite_messages)::text ~ '${newParent}|${studentPhone}'`)),0);

 // Next refresh: the queue is empty for this caller and still number-free.
 html=clean(await (await fetch(`${site}/counsellor`,{headers:{cookie:caller.cookie()}})).text(),'Desk after save');
 assert.match(html,/No students to call right now/);

 // Head view: progress for the caller; audit rows carry ids, not numbers.
 html=await (await fetch(`${site}/branch/calling`,{headers:{cookie:head.cookie()}})).text();
 assert.match(html,/QA Secure Caller/);
 assert.equal(Number(sql(`select count(*) from public.audit_logs where entity_id in ('${studentId}','${callerId}') and details::text ~ '${studentPhone}|${parentPhone}|${newParent}|${workPhone}'`)),0,'Audit log holds no numbers');
 console.log('secure calling API: ok');
}finally{
 if(created)sql(`delete from public.invite_messages where student_id='${studentId}';delete from public.call_logs where student_id='${studentId}';delete from public.appointments where student_id='${studentId}';
  delete from private.caller_current_lead where caller_id='${callerId}';delete from public.call_attempts where caller_id='${callerId}';delete from public.students where id='${studentId}';
  delete from public.audit_logs where actor_id='${callerId}' or entity_id in ('${studentId}','${callerId}');delete from public.staff_profiles where id='${callerId}';delete from auth.users where id='${callerId}';
  update public.branches set secure_calling=${wasSecure} where id='${branch}';`);
}
