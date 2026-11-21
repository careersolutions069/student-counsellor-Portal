import {dateTime} from '@/lib/utils';
import type {Branch} from '@/components/staff-management';
export type Transfer={id:string;student_id:string;from_branch_id:string;to_branch_id:string;reason:string;transferred_by:string;created_at:string};
export type HistoryStudent={id:string;full_name:string;registration_number:string|null};
export function History({transfers,branches,staff=[],students=[]}:{transfers:Transfer[];branches:Branch[];staff?:{id:string;full_name:string}[];students?:HistoryStudent[]}) {
 return <section className="panel space-y-4"><h2 className="section-title">Transfer history</h2>
  {!transfers.length&&<p className="text-sm text-slate-500">No transfers to show.</p>}
  {transfers.map(t=><article key={t.id} className="space-y-2 rounded-lg border border-slate-200 p-4"><h3 className="text-sm font-semibold">{students.find(s=>s.id===t.student_id)?.full_name||'Student record'} transferred</h3><p className="text-sm text-slate-600">{branches.find(b=>b.id===t.from_branch_id)?.name||'Another branch'} → {branches.find(b=>b.id===t.to_branch_id)?.name||'Another branch'}</p><p className="text-sm">{t.reason}</p><p className="text-xs text-slate-500">{dateTime(t.created_at)} · {staff.find(p=>p.id===t.transferred_by)?.full_name||'Owner'}</p></article>)}
 </section>;
}
