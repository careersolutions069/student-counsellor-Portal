// Local seeded Supabase + Next dev server only. --keep-fixture supports browser QA.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { readFile,writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { hash,newSessionToken,signStudentSession } from '../lib/session.ts';
const {encodeReply}=createRequire(import.meta.url)('next/dist/compiled/react-server-dom-webpack/client.node');
process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Local database required');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const caller=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options);
const jar=new Map();
const head=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});
const bucket=admin.storage.from('student-documents');
const id=randomUUID(),objects=[];
let keep=false;
function ok(result,label){if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data;}
async function profile(){return ok(await head.rpc('managed_students').select('*,student_visit_drafts(version,fields)').eq('id',id).single(),'Read manager visit');}
try {
 ok(await head.auth.signInWithPassword({email:'patna.head@career.test',password:'CareerDemo!2026'}),'Head login');
 ok(await caller.auth.signInWithPassword({email:'patna.caller@career.test',password:'CareerDemo!2026'}),'Caller login');
 ok(await head.from('students').insert({id,branch_id:'10000000-0000-4000-8000-000000000001',assigned_to:'20000000-0000-4000-8000-000000000004',full_name:'QA Visit Student',student_phone:'9777700012',city:'Patna',state:'Bihar',target_course:'MBBS / BDS',percentage_or_score:'610'}),'Enquiry fixture');
 const cookie=Array.from(jar,([name,value])=>`${name}=${value}`).join('; ');
 const dashboard=await fetch('http://localhost:3000/branch',{headers:{cookie}});assert.equal(dashboard.status,200,'Dashboard works with protected columns');
 const manifest=JSON.parse(await readFile('.next/dev/server/server-reference-manifest.json','utf8')).node;
 async function action(name,form){
  const key=Object.entries(manifest).find(([,v])=>v.exportedName===name)?.[0];assert.ok(key,'Action is compiled');
  const body=await encodeReply([{},form]);assert.ok((await new Response(body).blob()).size<4500000,'Multipart body stays below 4.5 MB');
  const response=await fetch('http://localhost:3000/branch',{method:'POST',headers:{'Next-Action':key,origin:'http://localhost:3000',cookie},body:body});
  if(response.status!==200) throw new Error(`Server action HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.text();
 }
 async function save(type,pdf,amount='1200.50'){
  const s=await profile();const form=new FormData();
  for(const [key,value] of Object.entries({id,draft_version:s.student_visit_drafts?.version||'',branch_id:s.branch_id,expected_pdf_path:s.college_pdf_path||'',expected_college_type:s.college_type||'',full_name:s.full_name,'F/N':'QA Parent',student_phone:s.student_phone,city:s.city,state:s.state,counselling_amount:amount,percentage_or_score:s.percentage_or_score,marks_type:'approximate',college_type:type}))form.set(key,value);
  form.append('selected_courses','MBBS');form.append('selected_courses','BDS');
  if(pdf)form.set('college_pdf',new Blob([pdf],{type:'application/pdf'}),`${type}.pdf`);
  return action('saveVisitDetails',form);
 }
 const draftFields={city:'Draft city',college_type:'government',counselling_amount:'12.'};
 const draftWrite={target:id,expected_branch:(await profile()).branch_id,expected_version:null,next_version:randomUUID(),draft:draftFields};
 ok(await head.rpc('save_visit_draft',draftWrite),'Save partial visit without a PDF');
 ok(await head.rpc('save_visit_draft',draftWrite),'Retry same save');
 assert.deepEqual((await profile()).student_visit_drafts.fields,draftFields,'Draft restored when reopening');
 assert.equal((await profile()).visit_details_completed,false);
 assert.ok((await head.rpc('save_visit_draft',{...draftWrite,next_version:randomUUID()})).error,'Reject stale editor');
 assert.ok((await caller.rpc('save_visit_draft',draftWrite)).error,'Caller cannot save draft');
 assert.deepEqual(ok(await caller.from('student_visit_drafts').select('*').eq('student_id',id),'Caller draft access'),[]);
 assert.ok((await save('government',null)).includes('Upload a new PDF'),'Initial PDF is required on server');
 assert.ok((await save('government',Buffer.from('%PDF-1.7'),'0')).includes('amount'),'Amount must be positive');
 assert.ok((await save('government',Buffer.from('<html>spoof'))).includes('valid PDF'),'File signature is checked');
 const oversized=new Uint8Array(4*1024*1024+1);oversized.set(Buffer.from('%PDF-1.7\n'));
 assert.ok((await save('government',oversized)).includes('File must be 4 MB or smaller'),'Oversized college PDF rejected cleanly');
 assert.equal((await profile()).college_pdf_path,null,'Rejected PDF leaves visit unchanged');
 const maxPdf=new Uint8Array(4*1024*1024);maxPdf.set(Buffer.from('%PDF-1.7\n'));
 assert.ok((await save('government',maxPdf)).includes('Visit details saved.'),'Full 4 MiB government PDF saves');
 let s=await profile();assert.deepEqual(s.student_visit_drafts.fields,{},'Finalization clears draft');objects.push(s.college_pdf_path);
 assert.equal(s.visit_details_completed,true);assert.equal(s.registration_number,null);assert.equal(s.is_profile_complete,false);assert.equal(Number(s.counselling_amount),1200.50);
 assert.ok((await caller.from('students').select('counselling_amount').eq('id',id)).error,'Caller cannot SELECT fee');
 assert.ok((await caller.from('students').select('college_pdf_path,college_pdf_name').eq('id',id)).error,'Caller cannot SELECT college file metadata');
 assert.ok((await caller.from('students').update({college_type:'private'}).eq('id',id)).error,'Caller cannot bypass type-change rule');
 assert.ok((await head.from('students').update({college_type:'private'}).eq('id',id)).error,'Head must also use validated visit save');
 const queue=ok(await caller.rpc('counsellor_queue',{queue_name:'to_call'}),'Caller queue');assert.ok(!/counselling_amount|college_pdf_path|college_pdf_name/.test(JSON.stringify(queue)),'Queue does not leak private visit fields');
 assert.equal((ok(await caller.rpc('managed_students'),'Caller manager RPC')).length,0);
 let response=await fetch(`http://localhost:3000/college-registration/${id}`,{redirect:'manual'});assert.equal(response.status,401,'Unauthenticated college viewer denied');
 response=await fetch(`http://localhost:3000/college-registration/${id}`,{headers:{cookie},redirect:'manual'});assert.equal(response.status,303,'Head can view college PDF');
 const claims=JSON.parse(Buffer.from(new URL(response.headers.get('location')).searchParams.get('token').split('.')[1],'base64url').toString());assert.ok(claims.exp-Date.now()/1000<=65,'College URL expires within 60 seconds');
 assert.ok((await save('private',oversized)).includes('File must be 4 MB or smaller'),'Oversized replacement rejected cleanly');assert.equal((await profile()).college_pdf_path,s.college_pdf_path);
 assert.ok((await save('private',null)).includes('Upload a new PDF'),'Changing college type needs new PDF');assert.equal((await profile()).college_pdf_path,s.college_pdf_path);
 assert.ok((await save('private',Buffer.from('%PDF-1.7\nPrivate college fixture'))).includes('Visit details saved.'),'Private PDF replacement saves');
 let next=await profile();objects.push(next.college_pdf_path);assert.notEqual(next.college_pdf_path,s.college_pdf_path);assert.ok((await bucket.download(s.college_pdf_path)).error,'Committed replacement removes old PDF');s=next;
 assert.ok((await save('private',null,'1500')).includes('Visit details saved.'),'Same type keeps saved PDF');assert.equal((await profile()).college_pdf_path,s.college_pdf_path);
 let form=new FormData();for(const [key,value] of Object.entries({id,full_name:s.full_name,student_phone:s.student_phone,dob:''}))form.set(key,value);
 await action('completeProfile',form);assert.equal((await profile()).registration_number,null,'No registration without DOB');
 form.set('dob','2007-01-01');assert.ok((await action('completeProfile',form)).includes('Registration ID'),'Separate registration action succeeds');
 s=await profile();assert.match(s.registration_number,/^CS-PAT-\d{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);assert.match(s.registration_number.slice(-6),/[A-Z]/);assert.match(s.registration_number.slice(-6),/[2-9]/);
 const studentToken=newSessionToken();const studentHash=hash(studentToken);
 const login=ok(await admin.rpc('student_login',{reg:s.registration_number.toLowerCase(),birth_date:'2007-01-01',ip_hash:'visit-api-fixture',session_hash:studentHash}),'New ID login');assert.equal(login.student_id,id);
 const studentCookie=`cs_student=${await signStudentSession(id,studentToken)}`;
 const privateViewer=await fetch(`http://localhost:3000/college-registration/${id}`,{headers:{cookie:studentCookie},redirect:'manual'});assert.equal(privateViewer.status,401,'Valid student session alone cannot view college PDF');
 const portal=ok(await admin.rpc('student_portal',{target:id,session_hash:studentHash}),'Student projection');assert.ok(!/counselling_amount|college_pdf_path|college_pdf_name/.test(JSON.stringify(portal)),'Student portal hides college PDF and fee');
 if(process.argv.includes('--keep-fixture')) {await writeFile('/private/tmp/career-visit-browser-fixture.json',JSON.stringify({id,registration:s.registration_number,objects}));keep=true;}
 console.log('PASS required visit fields, PDF-only 4 MiB upload, type replacement, fee/PDF privacy, manager-only viewer, two-step ID and lowercase new-ID login');
} finally {
 if(!keep){
  execFileSync('docker',['exec','-i','supabase_db_careerSolutions','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt','-c',`delete from private.student_sessions where student_id='${id}';delete from public.students where id='${id}';`],{stdio:'pipe'});
  if(objects.length)await bucket.remove(objects);
 }
 await head.auth.signOut({scope:'local'});await caller.auth.signOut({scope:'local'});
}
