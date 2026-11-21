// Local seeded Supabase only. Disposable visit fixtures have no real college PDFs.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const exec = promisify(execFile);
async function sql(query) {
  const {stdout} = await exec('docker', ['exec','-i','supabase_db_careerSolutions','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt','-c',query]);
  return stdout.trim();
}
const fixtures = Array.from({length:8},(_,i)=>({id:randomUUID(),phone:`9866600${String(i).padStart(3,'0')}`,name:`Registration concurrency ${i}`}));
const ids = fixtures.map(s=>`'${s.id}'`).join(',');
try {
  await sql(`insert into public.students(id,branch_id,full_name,student_phone,"F/N",city,state,counselling_amount,percentage_or_score,marks_type,selected_courses,college_type,college_pdf_path,college_pdf_name,visit_details_completed) values ${fixtures.map(s=>`('${s.id}','10000000-0000-4000-8000-000000000001','${s.name}','${s.phone}','Parent','Patna','Bihar',1000,'610','exact',array['MBBS'],'government','10000000-0000-4000-8000-000000000001/${s.id}/college-registration/${randomUUID()}.pdf','concurrency.pdf',true)`).join(',')};`);
  async function complete(s) {
    const output=await sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);select public.complete_student_profile('${s.id}','${s.name}','${s.phone}','2007-01-01');commit;`);
    const registration=output.split('\n').find(line=>line.startsWith('CS-'));
    assert.match(registration,/^CS-PAT-\d{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    assert.match(registration.slice(-6),/[A-Z]/);assert.match(registration.slice(-6),/[2-9]/);
    return registration;
  }
  const results=await Promise.all([...fixtures,...fixtures].map(complete));
  for(let i=0;i<fixtures.length;i++) assert.equal(results[i],results[i+fixtures.length],'Same student keeps one ID under concurrent retries');
  assert.equal(new Set(results).size,fixtures.length,'Different students have unique IDs');
  console.log('PASS concurrent random registration: 8 unique mixed IDs, 16 concurrent requests and idempotent retries');
} finally {
  await sql(`delete from private.student_sessions where student_id in (${ids});delete from public.students where id in (${ids});`);
}
