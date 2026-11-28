'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {saveDailyNote} from '@/app/counsellor/manual-actions';
import {reportContent,type CallReport} from '@/lib/daily-call-report';
export function DailyCallReport({report,editable}:{report:CallReport;editable:boolean}) {
  const [note,setNote]=useState(report.note);
  const [notice,setNotice]=useState('');
  const [pending,setPending]=useState(false);
  const {subject,text,total,rows,files,date}=reportContent(report);
  const dirty=editable&&note.trim()!==report.note;
  async function save() {
    setPending(true);
    try {const result=await saveDailyNote(report.date,note);setNotice(result.error||'Daily note saved.');}
    catch {setNotice('Could not save. Your note is still here.');} finally {setPending(false);}
  }
  return <article className="panel max-w-3xl space-y-4">
    <div><p className="text-sm text-muted">The Career Solutions · {date}</p><h2 className="section-title">{report.name}</h2></div>
    {files.map(f=><p key={f.name}>{f.name} · {f.count} logged</p>)}
    <table className="w-full text-left"><thead><tr><th>Calling status</th><th className="text-right">Count</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.label} className="border-t border-line"><td className="py-1">{r.label}</td><td className="text-right tabular-nums">{r.count}</td></tr>)}</tbody>
    <tfoot><tr className="border-t border-line"><th className="py-2">Total calls logged</th><th className="text-right">{total}</th></tr></tfoot></table>
    {editable?<div className="space-y-2"><label className="block font-semibold">Additional daily remarks (optional)<textarea maxLength={1000} rows={3} value={note} disabled={pending} onChange={e=>setNote(e.target.value)} className="mt-2 block w-full rounded-lg border border-input-line p-3 font-normal"/></label>{dirty&&<Button size="sm" disabled={pending} onClick={save}>Save daily note</Button>}</div>:report.note&&<p className="whitespace-pre-line"><strong>Additional remarks</strong><br/>{report.note}</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={dirty||pending} onClick={async()=>{try{await navigator.clipboard.writeText(text);setNotice('Report copied.');}catch{setNotice('Clipboard unavailable. Select and copy the report below.');}}}>Copy report</Button>
    {dirty||pending?<Button variant="outline" disabled>Email report</Button>:<Button variant="outline" asChild><a href={`mailto:${report.recipient||''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>Email report</a></Button>}</div>
    <p role="status">{notice}</p>{notice.startsWith('Clipboard unavailable')&&<textarea aria-label="Report to copy" className="w-full" readOnly value={text} onFocus={e=>e.target.select()}/>}
  </article>;
}
