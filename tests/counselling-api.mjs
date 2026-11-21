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
const jar=new Map();
const head=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});
const bucket=admin.storage.from('student-documents');
const id=randomUUID(),branch='10000000-0000-4000-8000-000000000001',objects=new Set();
const registration=`CS-PAT-2026-QA${randomUUID().replaceAll('-','').slice(0,4).toUpperCase()}`;
let keep=false;
function ok(result,label){if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data;}
function sql(query){return execFileSync('docker',['exec','-i','supabase_db_careerSolutions','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt','-c',query],{encoding:'utf8',stdio:'pipe'});}
async function docs(){const data=ok(await head.from('counselling_documents').select('*').eq('student_id',id),'Documents');for(const d of data)objects.add(d.file_path);return data;}
async function doc(category,phase=null){return (await docs()).find(d=>d.doc_category===category&&d.phase_number===phase);}
async function state(){return ok(await head.from('student_counselling').select('*').eq('student_id',id).single(),'State');}
try {
 ok(await head.auth.signInWithPassword({email:'patna.head@career.test',password:'CareerDemo!2026'}),'Head login');
 ok(await head.from('students').insert({id,branch_id:branch,full_name:'QA Counselling Student',student_phone:'9777700013',target_course:'MBBS',assigned_to:'20000000-0000-4000-8000-000000000004'}),'Enquiry fixture');
 sql(`update public.students set dob='2007-01-01',registration_number='${registration}',is_profile_complete=true where id='${id}';`);
 const cookie=Array.from(jar,([name,value])=>`${name}=${value}`).join('; ');
 assert.equal((await fetch('http://localhost:3000/branch',{headers:{cookie}})).status,200);
 const manifest=JSON.parse(await readFile('.next/dev/server/server-reference-manifest.json','utf8')).node;
 async function action(name,values,file){
  const key=Object.entries(manifest).find(([,v])=>v.exportedName===name)?.[0];assert.ok(key,`${name} compiled`);
  const form=new FormData();form.set('student_id',id);
  for(const [name,value] of Object.entries(values||{}))for(const item of Array.isArray(value)?value:[value])form.append(name,String(item??''));
  if(file)form.set('file',new Blob([file],{type:'application/pdf'}),'counselling.pdf');
  const body=await encodeReply([{},form]);assert.ok((await new Response(body).blob()).size<4500000,'Multipart body stays below 4.5 MB');
  const response=await fetch('http://localhost:3000/branch',{method:'POST',headers:{'Next-Action':key,origin:'http://localhost:3000',cookie},body});
  if(response.status!==200)throw new Error(`${name} HTTP ${response.status}: ${(await response.text()).slice(0,400)}`);return response.text();
 }
 const token=newSessionToken(),sessionHash=hash(token);
 ok(await admin.rpc('student_login',{reg:registration,birth_date:'2007-01-01',ip_hash:`counselling-${id}`,session_hash:sessionHash}),'Student login');
 const studentCookie=`cs_student=${await signStudentSession(id,token)}`;
 async function portal(){return ok(await admin.rpc('student_portal',{target:id,session_hash:sessionHash}),'Portal');}
 async function view(document,asStudent=false){return fetch(`http://localhost:3000/counselling-documents/${document.id}${asStudent?'?as=student':''}`,{headers:{cookie:asStudent?studentCookie:cookie},redirect:'manual'});}
 const pdf=Buffer.from('%PDF-1.7\nCounselling fixture');
 async function upload(category,phase=null,bytes=pdf,version){const previous=version||await doc(category,phase);return action('uploadCounsellingPdf',{doc_category:category,phase_number:phase,document_id:previous?.id,created_at:previous?.created_at},bytes);}
 assert.ok((await action('saveCounsellingStates',{preferred_states:['Bihar','Goa','Delhi','Assam','Punjab','Kerala']})).includes('Select up to 5'));
 assert.ok((await action('saveCounsellingStates',{preferred_states:['Bihar','Delhi']})).includes('Preferred states saved'));
 assert.deepEqual((await state()).preferred_states,['Bihar','Delhi']);
 assert.ok((await action('recordCounsellingOutcome',{phase_number:1,outcome:'not_allotted'})).includes('Choice PDF is required'));
 assert.ok((await upload('choice_pdf',2)).includes('locked'),'Cannot upload future phase');
 assert.ok((await upload('new_choice_pdf')).includes('locked'),'Cannot use post-allotment slot early');
 assert.ok((await upload('security_deposit',null,Buffer.from('not a pdf'))).includes('valid PDF'));
 const oversized=new Uint8Array(4*1024*1024+1);oversized.set(Buffer.from('%PDF-1.7\n'));
 assert.ok((await upload('choice_pdf',1,oversized)).includes('File must be 4 MB or smaller'));
 assert.equal((await docs()).length,0,'Rejected uploads create no slots');
 const maxPdf=new Uint8Array(4*1024*1024);maxPdf.set(Buffer.from('%PDF-1.7\n'));
 assert.ok((await upload('choice_pdf',1,maxPdf)).includes('PDF saved.'));
 assert.ok((await upload('stage_doc_1_3')).includes('PDF saved.'));
 let first=await doc('choice_pdf',1);const originalPath=first.file_path;
 assert.equal(first.show_to_student,false);assert.deepEqual((await portal()).counselling_documents,[]);
 const pageBefore=await (await fetch('http://localhost:3000/student',{headers:{cookie:studentCookie}})).text();assert.ok(!pageBefore.includes('Counselling Documents &amp; Allotments'),'No empty shared section');
 assert.equal((await view(first,true)).status,404,'Hidden file denied to own student');
 assert.equal((await view(first)).status,303,'Head can view private PDF');
 assert.equal((await fetch(`http://localhost:3000/counselling-documents/${first.id}`,{redirect:'manual'})).status,401);
 assert.ok((await action('setCounsellingVisibility',{document_id:first.id,created_at:first.created_at,show_to_student:true})).includes('Document shared'));
 let shared=(await portal()).counselling_documents;assert.deepEqual(Object.keys(shared[0]).sort(),['file_name','id','label']);
 let response=await view(first,true);assert.equal(response.status,303);assert.match(response.headers.get('cache-control'),/no-store/);
 const signedUrl=response.headers.get('location'),claims=JSON.parse(Buffer.from(new URL(signedUrl).searchParams.get('token').split('.')[1],'base64url').toString());assert.ok(claims.exp-Date.now()/1000<=65);
 assert.equal((await (await fetch(signedUrl)).arrayBuffer()).byteLength,4*1024*1024,'4 MiB storage round-trip');
 assert.ok((await action('setCounsellingVisibility',{document_id:first.id,created_at:first.created_at,show_to_student:false})).includes('Document hidden'));
 assert.equal((await view(first,true)).status,404,'Fresh URL request denied immediately after hiding');
 const outcomes=await Promise.all([1,2].map(()=>head.rpc('counselling_outcome',{target:id,expected_phase:1,outcome:'not_allotted'})));
 assert.equal(outcomes.filter(r=>!r.error).length,1,'Only one concurrent phase transition succeeds');assert.equal((await state()).current_phase,2);
 assert.ok((await action('reuseCounsellingChoice',{phase_number:2,source_doc_id:first.id})).includes('Choice PDF reused'));
 let second=await doc('choice_pdf',2);assert.equal(second.file_path,originalPath);assert.equal(second.reused_from_doc_id,first.id);assert.equal(second.show_to_student,false);
 assert.ok((await upload('choice_pdf',1,pdf)).includes('PDF saved.'));
 first=await doc('choice_pdf',1);assert.notEqual(first.file_path,originalPath);assert.equal(first.show_to_student,false);
 assert.equal((await ok(await bucket.download(originalPath),'Reused PDF retained').arrayBuffer()).byteLength,4*1024*1024);
 assert.ok((await action('setCounsellingVisibility',{document_id:first.id,created_at:second.created_at,show_to_student:true})).includes('Document changed'),'Stale sharing cannot reveal replacement');
 assert.ok((await upload('choice_pdf',2,pdf)).includes('PDF saved.'));second=await doc('choice_pdf',2);
 assert.equal(second.reused_from_doc_id,null);assert.ok((await bucket.download(originalPath)).error,'Last reference replacement removes old bytes');
 assert.equal((await docs()).filter(d=>d.doc_category==='stage_doc_1_3').length,1,'One inherited stage slot');
 assert.ok((await action('recordCounsellingOutcome',{phase_number:2,outcome:'allotted'})).includes('College allotted.'));
 assert.equal((await state()).allotted_phase,2);
 assert.ok((await upload('allotment_letter',2)).includes('PDF saved.'));
 assert.ok((await upload('new_allotment_letter')).includes('locked'));
 for(const category of ['new_choice_pdf','new_allotment_letter','upgrade_choice_pdf','upgraded_allotment_letter'])assert.ok((await upload(category)).includes('PDF saved.'),category);
 const letter=await doc('allotment_letter',2);
 assert.ok((await action('setCounsellingVisibility',{document_id:letter.id,created_at:letter.created_at,show_to_student:true})).includes('Document shared'));
 shared=(await portal()).counselling_documents;assert.equal(shared.length,1);assert.equal(shared[0].id,letter.id);
 const page=await (await fetch('http://localhost:3000/student',{headers:{cookie:studentCookie}})).text();assert.ok(page.includes('Counselling Documents &amp; Allotments'));assert.ok(!page.includes('preferred_states'));assert.ok(!page.includes(first.id));
 response=await view(letter,true);assert.equal(response.status,303);
 assert.ok((await action('saveCounsellingStates',{preferred_states:['Bihar','Karnataka']})).includes('Preferred states saved'));
 if(process.argv.includes('--keep-fixture')){await writeFile('/private/tmp/career-counselling-browser-fixture.json',JSON.stringify({id,registration,objects:[...objects],letterId:letter.id}));keep=true;}
 console.log('PASS counselling: real multipart 4 MiB boundary, PDF signature, phase locks/concurrency, inheritance, snapshot reuse/cleanup, default-hidden sharing, student projection and 60-second viewer');
}finally{
 if(!keep){sql(`delete from private.student_sessions where student_id='${id}';delete from public.students where id='${id}';`);if(objects.size)await bucket.remove([...objects]);}
 await head.auth.signOut({scope:'local'});
}
