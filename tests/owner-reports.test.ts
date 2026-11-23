import test from 'node:test';import assert from 'node:assert/strict';
import {reportFilters,percent,formatINR,branchReportCsv,branchLabel,type BranchReport} from '../lib/owner-reports';
test('report dates use inclusive IST lead cohorts, rolling presets and validated custom ranges',()=>{
 const now=new Date('2026-11-20T19:00:00Z');
 const month=reportFilters({period:'month'},now);assert.equal(month.start_at,'2026-10-31T18:30:00.000Z');assert.equal(month.end_at,'2026-11-21T18:30:00.000Z');
 const week=reportFilters({period:'7'},now);assert.equal(week.start_at,'2026-11-14T18:30:00.000Z');
 const custom=reportFilters({period:'custom',from:'2026-11-01',to:'2026-11-02'});assert.equal(custom.end_at,'2026-11-02T18:30:00.000Z');
 assert.throws(()=>reportFilters({period:'custom',from:'2026-11-02',to:'2026-11-01'}));assert.throws(()=>reportFilters({branch:'bad'}));assert.equal(reportFilters({}).start_at,null);
});
test('INR formatting preserves exact aggregate paise and rates handle zero denominators',()=>{
 assert.equal(formatINR('150000.00'),'₹1,50,000');assert.equal(formatINR('150000.50'),'₹1,50,000.50');assert.equal(formatINR('10000000000000000.12'),'₹10,00,00,00,00,00,00,000.12');assert.equal(percent(1,3),33.33);assert.equal(percent(0,0),0);
 const csv=branchReportCsv([{branch_id:null,name:'=unsafe, branch',code:'ALL',is_active:true,enquiries:3,invited:2,attended:1,visit_details:2,registered:1,allotted:1,amount:'150000.50'}]);assert.match(csv,/"'=unsafe, branch"/);assert.match(csv,/150000.50/);assert.match(csv,/66.67/);
});

test('branch report keeps attendance and visit details separate and labels inactive branches',()=>{
 const rows:BranchReport[]=[
  {branch_id:'a',name:'Patna',code:'PAT',is_active:true,enquiries:4,invited:3,attended:1,visit_details:2,registered:1,allotted:0,amount:'0'},
  {branch_id:'b',name:'Old Branch',code:'OLD',is_active:false,enquiries:2,invited:1,attended:1,visit_details:0,registered:0,allotted:0,amount:'0'},
  {branch_id:null,name:'All-India Total',code:'ALL',is_active:true,enquiries:6,invited:4,attended:2,visit_details:2,registered:1,allotted:0,amount:'0'},
 ];
 assert.equal(branchLabel(rows[0]),'Patna');assert.equal(branchLabel(rows[1]),'Old Branch (inactive)');assert.equal(branchLabel(rows[2]),'All-India Total');
 const lines=branchReportCsv(rows).replace('\uFEFF','').trim().split('\r\n').map(line=>line.slice(1,-1).split('","'));
 assert.deepEqual(lines[0].slice(3,8),['Total Enquiries','F2F Invited','Visits Attended','Visit Details Completed','Visit Details Completed % of Enquiries']);
 assert.deepEqual(lines[1].slice(0,8),['Patna','PAT','Active','4','3','1','2','50']);
 assert.deepEqual(lines[2].slice(0,8),['Old Branch','OLD','Inactive','2','1','1','0','0']);
 assert.deepEqual(lines[3].slice(2,8),['All branches','6','4','2','2','33.33']);
 assert.equal(lines.slice(1,3).reduce((sum,line)=>sum+Number(line[5]),0),Number(lines[3][5]),'Total attended equals the sum of branch rows');
});
