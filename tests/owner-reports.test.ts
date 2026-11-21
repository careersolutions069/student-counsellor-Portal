import test from 'node:test';import assert from 'node:assert/strict';
import {reportFilters,percent,formatINR,branchReportCsv} from '../lib/owner-reports';
test('report dates use inclusive IST lead cohorts, rolling presets and validated custom ranges',()=>{
 const now=new Date('2026-11-20T19:00:00Z');
 const month=reportFilters({period:'month'},now);assert.equal(month.start_at,'2026-10-31T18:30:00.000Z');assert.equal(month.end_at,'2026-11-21T18:30:00.000Z');
 const week=reportFilters({period:'7'},now);assert.equal(week.start_at,'2026-11-14T18:30:00.000Z');
 const custom=reportFilters({period:'custom',from:'2026-11-01',to:'2026-11-02'});assert.equal(custom.end_at,'2026-11-02T18:30:00.000Z');
 assert.throws(()=>reportFilters({period:'custom',from:'2026-11-02',to:'2026-11-01'}));assert.throws(()=>reportFilters({branch:'bad'}));assert.equal(reportFilters({}).start_at,null);
});
test('INR formatting preserves exact aggregate paise and rates handle zero denominators',()=>{
 assert.equal(formatINR('150000.00'),'₹1,50,000');assert.equal(formatINR('150000.50'),'₹1,50,000.50');assert.equal(formatINR('10000000000000000.12'),'₹10,00,00,00,00,00,00,000.12');assert.equal(percent(1,3),33.33);assert.equal(percent(0,0),0);
 const csv=branchReportCsv([{branch_id:null,name:'=unsafe, branch',code:'ALL',enquiries:3,invited:2,attended:1,registered:1,allotted:1,amount:'150000.50'}]);assert.match(csv,/"'=unsafe, branch"/);assert.match(csv,/150000.50/);assert.match(csv,/33.33/);
});
