import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ADMISSION_STATUSES,isAdmissionStatus} from '../lib/admission-status';
test('admission statuses cover Pending, Applied and Admission Confirmed and reject free text',()=>{
 for(const status of ['Pending','Applied','Admission Confirmed']) assert.ok(isAdmissionStatus(status));
 for(const value of ['Confirmed','Admitted','Application Submitted','admission confirmed',' Applied','','Shortlisted',null,undefined]) assert.equal(isAdmissionStatus(value),false);
});
test('database constraint lists exactly the application statuses',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261123090000_reporting_and_admission_status.sql',import.meta.url),'utf8');
 const clause=sql.match(/admission_status in \(([^)]*)\)/)?.[1]||'';
 const inDatabase=[...clause.matchAll(/'([^']+)'/g)].map(match=>match[1]);
 assert.deepEqual(inDatabase,[...ADMISSION_STATUSES]);
});
