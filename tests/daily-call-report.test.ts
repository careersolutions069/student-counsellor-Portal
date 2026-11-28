import test from 'node:test';
import assert from 'node:assert/strict';
import {reportContent,CALL_LABELS,type ManualOutcome} from '../lib/daily-call-report';
test('daily report includes all 13 statuses, file totals, and only the shared daily note',()=>{
 const counts=[15,2,61,14,18,19,9,72,0,4,2,2,0];
 const groups=(Object.keys(CALL_LABELS) as ManualOutcome[]).map((status,i)=>({file:i===1?'File 2':'File 1',campaign:'Medical · Repeat call',status,count:counts[i]}));
 const report=reportContent({groups,date:'2026-04-28',name:'Demo caller',recipient:null,note:'Request fee sheet'});
 assert.equal(report.total,218);assert.equal(report.rows.length,13);assert.equal(report.files.length,2);
 assert.match(report.text,/Invalid number: 0/);assert.match(report.text,/Wrong number: 2/);
 assert.match(report.text,/Next year 2027: 0/);assert.match(report.text,/Request fee sheet/);
 assert.match(report.subject,/Demo caller/);
});
