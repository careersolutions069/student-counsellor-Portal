// Local seeded Supabase and Next dev server only (npm run dev). Uses synthetic records and removes them afterwards.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServerClient } from '@supabase/ssr';
const { encodeReply } = createRequire(import.meta.url)('next/dist/compiled/react-server-dom-webpack/client.node');
process.loadEnvFile('.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Local only');
const app = 'http://localhost:3000';
const ownerId = '20000000-0000-4000-8000-000000000001';
const zzz = randomUUID(), s1 = randomUUID(), s2 = randomUUID(), s3 = randomUUID();
const phones = ['9777700301', '9777700302', '9777700303'];
function sql(query) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_careerSolutions', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', query], { encoding: 'utf8', stdio: 'pipe' });
}
function ok(result, label) { if (result.error) throw Error(`${label}: ${result.error.message}`); return result.data; }
function actor() {
  const jar = new Map();
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => Array.from(jar, ([name, value]) => ({ name, value })), setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value)) },
  });
  return { client, cookie: () => Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ') };
}
function csvRows(text) {
  return text.replace('﻿', '').trim().split('\r\n').map((line) => line.slice(1, -1).split('","'));
}
const owner = actor(), head = actor(), caller = actor();
let created = false;
try {
  assert.equal(Number(sql(`select count(*) from public.students where student_phone in ('${phones.join("','")}');`).trim()), 0, 'Fixture numbers must be unused');
  created = true;
  // Inactive branch ZZZ: s1 = visit details only, s2 = two attended appointments, s3 = enquiry only.
  sql(`
   insert into public.branches(id,name,code,city,address,google_maps_url,is_active) values('${zzz}','QA Closed Branch','ZZZ','Patna','Fixture address, Patna','https://www.google.com/maps/search/?api=1&query=Fixture',false);
   insert into public.students(id,branch_id,full_name,student_phone,lead_source) values('${s1}','${zzz}','QA Visit Only','${phones[0]}','QA'),('${s2}','${zzz}','QA Two Attended','${phones[1]}','QA'),('${s3}','${zzz}','QA Enquiry Only','${phones[2]}','QA');
   update public.students set "F/N"='Fixture parent',city='Patna',state='Bihar',counselling_amount=100,percentage_or_score='600',marks_type='exact',selected_courses=array['MBBS'],college_type='government',college_pdf_path=branch_id::text||'/'||id::text||'/college-registration/test.pdf',college_pdf_name='test.pdf',visit_details_completed=true where id='${s1}';
   insert into public.appointments(student_id,branch_id,created_by,scheduled_at,status) values('${s2}','${zzz}','${ownerId}',now()-interval '2 days','attended'),('${s2}','${zzz}','${ownerId}',now()-interval '1 day','completed');`);
  for (const [who, email] of [[owner, 'owner@career.test'], [head, 'patna.head@career.test'], [caller, 'patna.caller@career.test']])
    ok(await who.client.auth.signInWithPassword({ email, password: 'CareerDemo!2026' }), `${email} login`);

  // Dashboard KPI, Owner report RPC and CSV agree for the inactive branch and for all branches.
  const kpiZzz = ok(await owner.client.rpc('dashboard_kpis', { selected_branch: zzz }), 'Branch KPIs');
  assert.deepEqual([kpiZzz.total_leads, kpiZzz.f2f_attended, kpiZzz.visit_details_completed], [3, 1, 1]);
  const reportZzz = ok(await owner.client.rpc('owner_conversion_report', { selected_branch: zzz }), 'Inactive branch report');
  assert.deepEqual([reportZzz.total.enquiries, reportZzz.total.attended, reportZzz.total.visit_details], [3, 1, 1]);
  assert.equal(reportZzz.branches[0].is_active, false);
  let response = await fetch(`${app}/owner/reports?branch=${zzz}&period=all`, { headers: { cookie: owner.cookie() } });
  assert.equal(response.status, 200);
  let rows = csvRows(await response.text());
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  assert.ok(col('Visits Attended') > 0 && col('Visit Details Completed') > 0 && col('Branch Status') > 0);
  assert.equal(header.some((h) => h.includes('Converted')), false, 'Old combined metric label is gone');
  const zzzRow = rows.find((r) => r[1] === 'ZZZ');
  assert.equal(zzzRow[col('Branch Status')], 'Inactive');
  assert.equal(zzzRow[col('Visits Attended')], String(kpiZzz.f2f_attended));
  assert.equal(zzzRow[col('Visit Details Completed')], String(kpiZzz.visit_details_completed));
  assert.equal(zzzRow[col('Visit Details Completed % of Enquiries')], '33.33');

  const kpiAll = ok(await owner.client.rpc('dashboard_kpis', { selected_branch: null }), 'All KPIs');
  response = await fetch(`${app}/owner/reports?period=all`, { headers: { cookie: owner.cookie() } });
  rows = csvRows(await response.text());
  const branchRows = rows.slice(1).filter((r) => r[1] !== 'ALL');
  const total = rows.find((r) => r[1] === 'ALL');
  assert.ok(branchRows.some((r) => r[1] === 'ZZZ' && r[col('Branch Status')] === 'Inactive'), 'All Branches CSV includes the inactive branch');
  assert.equal(total[col('Visits Attended')], String(kpiAll.f2f_attended));
  assert.equal(total[col('Visit Details Completed')], String(kpiAll.visit_details_completed));
  assert.equal(total[col('Total Enquiries')], String(kpiAll.total_leads));
  assert.equal(branchRows.reduce((sum, r) => sum + Number(r[col('Visits Attended')]), 0), Number(total[col('Visits Attended')]));

  // Owner pages show the separate metrics and the inactive label.
  let html = await (await fetch(`${app}/owner?branch=${zzz}`, { headers: { cookie: owner.cookie() } })).text();
  assert.ok(html.includes('Visit Details Completed') && html.includes('F2F Attended'));
  html = await (await fetch(`${app}/owner?tab=reports&period=all`, { headers: { cookie: owner.cookie() } })).text();
  assert.ok(html.includes('QA Closed Branch (inactive)'));

  // Centre Heads and Tele-Counsellors cannot reach Owner reports.
  for (const who of [head, caller]) {
    response = await fetch(`${app}/owner/reports`, { headers: { cookie: who.cookie() }, redirect: 'manual' });
    assert.ok([303, 307].includes(response.status) && !response.headers.get('content-type')?.includes('text/csv'));
    assert.ok((await who.client.rpc('owner_conversion_report')).error, 'RPC denied');
  }

  // Server action: controlled admission statuses.
  const manifest = JSON.parse(await readFile('.next/dev/server/server-reference-manifest.json', 'utf8')).node;
  const key = Object.entries(manifest).find(([, v]) => v.exportedName === 'addStudentActivity')?.[0];
  assert.ok(key, 'Shortlist action compiled');
  async function addShortlist(status, college) {
    const form = new FormData();
    for (const [k, v] of Object.entries({ kind: 'shortlist', student_id: s3, college_name: college, course_name: 'B.Sc', fees_estimate: '', document_status: '', admission_status: status })) form.set(k, v);
    const body = await encodeReply([{}, form]);
    const result = await fetch(`${app}/owner`, { method: 'POST', headers: { 'Next-Action': key, origin: app, cookie: owner.cookie() }, body });
    assert.equal(result.status, 200);
    return result.text();
  }
  assert.ok((await addShortlist('Confirmed', 'Free Text College')).includes('Choose a valid admission status.'));
  assert.equal(sql(`select count(*) from public.shortlists_and_admissions where student_id='${s3}';`).trim(), '0');
  assert.ok((await addShortlist('Admission Confirmed', 'Controlled College')).includes('Activity saved.'));
  assert.equal(sql(`select admission_status from public.shortlists_and_admissions where student_id='${s3}';`).trim(), 'Admission Confirmed');
  assert.equal((ok(await owner.client.rpc('dashboard_kpis', { selected_branch: zzz }), 'KPIs after shortlist')).admissions_confirmed, 1);
  html = await (await fetch(`${app}/owner?branch=${zzz}`, { headers: { cookie: owner.cookie() } })).text();
  assert.ok(html.includes('Pending') && html.includes('Applied') && html.includes('Admission Confirmed') && html.includes('Not Admitted'));
  console.log('PASS dashboard, Owner report and CSV agree on attendance; inactive branch history; controlled admission statuses; Owner-only access');
} finally {
  if (created) sql(`
   delete from public.shortlists_and_admissions where branch_id='${zzz}';delete from public.appointments where branch_id='${zzz}';
   delete from public.audit_logs where branch_id='${zzz}' or entity_id in ('${s1}','${s2}','${s3}','${zzz}');
   delete from public.students where branch_id='${zzz}';delete from public.audit_logs where branch_id='${zzz}';delete from public.branches where id='${zzz}';`);
  for (const who of [owner, head, caller]) await who.client.auth.signOut({ scope: 'local' });
}
