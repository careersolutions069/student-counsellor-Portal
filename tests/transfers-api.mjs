// Local seeded Supabase and Next dev server only; the fictional student is removed afterward.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {createServerClient} from '@supabase/ssr';
process.loadEnvFile('.env.local');const url=process.env.NEXT_PUBLIC_SUPABASE_URL;assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Local only');
const id=randomUUID(),patna='10000000-0000-4000-8000-000000000001',bangalore='10000000-0000-4000-8000-000000000002',registration=`CS-PAT-2026-${randomUUID().replaceAll('-','').slice(0,6).toUpperCase()}`;
function actor(){const jar=new Map();return {client:createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}}),cookie:()=>Array.from(jar,([name,value])=>`${name}=${value}`).join('; ')};}
function ok(r,label){if(r.error)throw Error(`${label}: ${r.error.message}`);return r.data;}
function sql(query){return execFileSync('docker',['exec','-i','supabase_db_careerSolutions','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt','-c',query],{encoding:'utf8',stdio:'pipe'});}
const owner=actor(),head=actor();
try {
 ok(await owner.client.auth.signInWithPassword({email:'owner@career.test',password:'CareerDemo!2026'}),'Owner login');ok(await head.client.auth.signInWithPassword({email:'patna.head@career.test',password:'CareerDemo!2026'}),'Head login');
 ok(await head.client.from('students').insert({id,branch_id:patna,assigned_to:'20000000-0000-4000-8000-000000000004',full_name:'Local Transfer Check',student_phone:'9777700401'}),'Local enquiry');
 sql(`update public.students set registration_number='${registration}' where id='${id}';insert into private.student_sessions(token_hash,student_id,expires_at) values('${id}','${id}',now()+interval '1 hour');insert into public.student_documents(student_id,branch_id,document_name) values('${id}','${patna}','Transfer test checklist');insert into public.student_counselling(student_id,branch_id) values('${id}','${patna}');`);
 let response=await fetch('http://localhost:3000/owner?tab=history&q=Local%20Transfer%20Check',{headers:{cookie:owner.cookie()}});assert.equal(response.status,200);let html=await response.text();assert.ok(html.includes('Student to transfer'));assert.ok(html.includes('Local Transfer Check'));assert.ok(html.includes('Transfer reason'));assert.ok(!html.includes('Activity history'));assert.ok(!html.includes('private_visit_details_changed'));
 response=await fetch('http://localhost:3000/branch?tab=history',{headers:{cookie:head.cookie()}});assert.equal(response.status,200);html=await response.text();assert.ok(html.includes('Only the Owner can transfer'));assert.ok(!html.includes('Student to transfer'));assert.ok(!html.includes('Activity history'));
 assert.ok((await head.client.rpc('transfer_student',{target:id,destination:bangalore,transfer_reason:'Forbidden role'})).error,'Head cannot bypass the UI');
 const manifest=JSON.parse(await readFile('.next/dev/server/server-reference-manifest.json','utf8')).node;const key=Object.entries(manifest).find(([,v])=>v.exportedName==='transferStudent')?.[0];assert.ok(key);
 const {encodeReply}=createRequire(import.meta.url)('next/dist/compiled/react-server-dom-webpack/client.node');
 async function transfer(destination,reason){const form=new FormData();form.set('id',id);form.set('branch_id',destination);form.set('reason',reason);const response=await fetch('http://localhost:3000/owner?tab=history',{method:'POST',headers:{'Next-Action':key,origin:'http://localhost:3000',cookie:owner.cookie()},body:await encodeReply([{},form])});assert.equal(response.status,200);return response.text();}
 assert.ok((await transfer(bangalore,'')).includes('Enter a transfer reason.'));assert.equal(ok(await owner.client.rpc('managed_students').eq('id',id).single(),'Unchanged student').branch_id,patna);
 assert.ok((await transfer(bangalore,'Local transfer form verification')).includes('Student transferred.'));
 const moved=ok(await owner.client.rpc('managed_students').eq('id',id).single(),'Transferred student');assert.equal(moved.branch_id,bangalore);assert.equal(moved.assigned_to,null);assert.equal(moved.registration_number,registration);
 assert.equal(ok(await head.client.from('students').select('id').eq('id',id),'Source branch visibility').length,0);
 assert.equal(sql(`select count(*) from private.student_sessions where student_id='${id}';`).trim(),'0');
 assert.equal(sql(`select count(*) from public.student_documents where student_id='${id}' and branch_id='${bangalore}';`).trim(),'1');assert.equal(sql(`select count(*) from public.student_counselling where student_id='${id}' and branch_id='${bangalore}';`).trim(),'1');
 assert.equal(ok(await owner.client.from('branch_transfers').select('id').eq('student_id',id),'Transfer record').length,1);
 console.log('PASS Owner transfer form/search, hidden activity, Centre Head read-only access, reason validation, atomic branch move, retained registration, cleared assignment, revoked sessions and child records');
}finally{
 sql(`delete from public.branch_transfers where student_id='${id}';delete from private.student_sessions where student_id='${id}';delete from public.students where id='${id}';`);
 for(const user of [owner,head])await user.client.auth.signOut({scope:'local'});
}
