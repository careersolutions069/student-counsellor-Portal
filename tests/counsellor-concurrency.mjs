// Local seed database only. Concurrent invites must serialize and retries must log once.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const exec = promisify(execFile);
const student = randomUUID();
async function sql(query) {
  const { stdout } = await exec('docker', ['exec', '-i', 'supabase_db_careerSolutions', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', query]);
  return stdout.trim();
}
async function invite(request) {
  await sql(`begin; set local role authenticated;
    select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
    select public.record_counsellor_action('${student}','{"full_name":"Concurrent caller fixture"}','invite','${request}',now()+interval '1 day');
    commit;`);
}
try {
  await sql(`insert into public.students(id,branch_id,assigned_to,full_name,student_phone) values('${student}','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Concurrent caller fixture','9898989898');`);
  const request = randomUUID();
  await Promise.all([invite(request), invite(request)]);
  assert.equal(await sql(`select count(*) from public.call_logs where student_id='${student}';`), '1');
  await Promise.all([invite(randomUUID()), invite(randomUUID())]);
  assert.equal(await sql(`select count(*) from public.appointments where student_id='${student}' and status='scheduled';`), '1');
  assert.equal(await sql(`select count(*) from public.call_logs where student_id='${student}';`), '3');
  assert.equal(await sql(`select pipeline_stage from public.students where id='${student}';`), 'F2F Scheduled');
  console.log('PASS concurrent invites leave one active visit; duplicate requests log once');
} finally {
  await sql(`begin; delete from public.call_logs where student_id='${student}'; delete from public.appointments where student_id='${student}'; delete from public.students where id='${student}'; commit;`);
}
