import {z} from 'zod';
export type ReportQuery={branch?:string;period?:string;from?:string;to?:string};
export type BranchReport={branch_id:string|null;name:string;code:string;is_active:boolean;enquiries:number;invited:number;attended:number;visit_details:number;registered:number;allotted:number;amount:string};
export type CallerReport={id:string;name:string;branch:string;is_active:boolean;assigned:number;calls:number;invites:number;attended:number};
export type OwnerReport={branches:BranchReport[];total:BranchReport;callers:CallerReport[];phases:number[];new_choices:number;new_allotments:number;upgrade_choices:number;upgrade_allotments:number;in_counselling:number};
const periods=z.enum(['all','month','30','7','custom']);
function nextDay(day:string,offset=1){const date=new Date(`${day}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);}
function midnight(day:string){return new Date(`${day}T00:00:00+05:30`).toISOString();}
export function reportFilters(query:ReportQuery,now=new Date()) {
 const branch=query.branch?z.uuid().parse(query.branch):null;
 const period=periods.parse(query.period||'all');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 let from='',to='';
 if(period==='custom'){from=z.iso.date().parse(query.from);to=z.iso.date().parse(query.to);if(from>to)throw Error('From date must be on or before To date.');}
 else if(period!=='all'){from=period==='month'?`${today.slice(0,7)}-01`:nextDay(today,-(Number(period)-1));to=today;}
 return {branch,period,from,to,start_at:from?midnight(from):null,end_at:to?midnight(nextDay(to)):null};
}
export function percent(numerator:number,denominator:number){return denominator?Math.round(numerator/denominator*10000)/100:0;}
export function formatINR(value:string) {
 const [whole,fraction='']=value.split('.');const paise=fraction.padEnd(2,'0').slice(0,2);
 return `₹${new Intl.NumberFormat('en-IN').format(BigInt(whole))}${paise==='00'?'':`.${paise}`}`;
}
export function branchLabel(row:Pick<BranchReport,'name'|'branch_id'|'is_active'>) {return row.branch_id&&!row.is_active?`${row.name} (inactive)`:row.name;}
export function branchReportCsv(rows:BranchReport[]) {
 const lines:unknown[][]=[['Branch','Code','Branch Status','Total Enquiries','F2F Invited','Visits Attended','Visit Details Completed','Visit Details Completed % of Enquiries','Registered IDs','Colleges Allotted','Counselling Amount Collected (INR)'],...rows.map(row=>[row.name,row.code,row.branch_id?(row.is_active?'Active':'Inactive'):'All branches',row.enquiries,row.invited,row.attended,row.visit_details,percent(row.visit_details,row.enquiries),row.registered,row.allotted,row.amount])];
 return '\uFEFF'+lines.map(row=>row.map(cell=>{let text=String(cell);if(/^[\s]*[=+\-@\t\r]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;}).join(',')).join('\r\n')+'\r\n';
}
