'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/fields';
import { CALL_LABELS, outcomeLabel, type ManualOutcome } from '@/lib/daily-call-report';
import { correctOrBook, logManualCall, type ManualDesk } from '@/app/counsellor/manual-actions';

export function ManualCallingDesk({desk, day}:{desk:ManualDesk;day:string}) {
  const {lead} = desk;
  const [remarks,setRemarks] = useState('');
  const [scheduling,setScheduling] = useState<'callback'|null>(null);
  const [followWhen,setFollowWhen] = useState('');
  const [when,setWhen] = useState('');
  const [last,setLast] = useState<{id:string;status:ManualOutcome;name:string;done?:'visit'|'callback'|'skipped'}|null>(null);
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const locked = useRef(false);
  const ticket = useRef<{assignment:string;id:string}|null>(null);
  async function run(work:()=>Promise<void>) {
    if(locked.current) return;
    locked.current=true;setBusy(true);setNotice('');
    try { await work(); } catch { setNotice('Connection interrupted. Retry to confirm the entry.'); }
    finally {locked.current=false;setBusy(false);}
  }
  function save(status:ManualOutcome,time:string|null=null,visit:string|null=null) {
    if(!lead) return;
    void run(async()=>{
      if(ticket.current?.assignment!==lead.assignment) ticket.current={assignment:lead.assignment,id:crypto.randomUUID()};
      const id=ticket.current.id;
      const result=await logManualCall(lead.id,lead.assignment,id,status,remarks,time,visit);
      if(result.error) {setNotice(result.error);return;}
      setLast({id,status,name:lead.name});setRemarks('');setWhen('');setScheduling(null);
      setFollowWhen('');
      if(status==='interested') setNotice(`${lead.name} added to your Centre Head’s Interested follow-ups.`);
    });
  }
  function followup(visit:string|null,callback:string|null=null) {
    if(!last) return;
    void run(async()=>{
      const result=await correctOrBook(last.id,visit,callback);
      if(result.error) {setNotice(result.error);return;}
      setFollowWhen('');
      if(visit) {setLast({...last,done:'visit'});setNotice(`Visit booked for ${last.name}. It has left the Interested follow-up list.`);}
      else if(callback) {setLast({...last,done:'callback'});setNotice(`Callback set for ${last.name}. They stay on the Interested follow-up list until a visit is booked.`);}
      else {setLast(null);setScheduling(null);setWhen('');setRemarks('');setNotice('Last entry undone.');}
    });
  }
  const timestamp = Date.parse(when + '+05:30');
  const selectedTime = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
  const followStamp = Date.parse(followWhen + '+05:30');
  const followTime = Number.isFinite(followStamp) && followStamp>Date.now() ? new Date(followStamp).toISOString() : '';
  function chooseOutcome(status: ManualOutcome) {
    setNotice('');
    if (status === 'callback') {
      setScheduling(status);
      setWhen('');
      return;
    }
    save(status);
  }
  return <section className="panel space-y-5" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>Today: {desk.total} / {desk.target} calls logged</strong><Link className="font-semibold text-primary underline" href="/calling-report">Daily report</Link></div>
    {/* Fixed height whether or not an entry was just saved, so the outcome buttons never shift under a fast click. */}
    <div className="flex h-16 items-center">{last?<div className="flex w-full flex-wrap items-center gap-3 rounded-lg bg-teal-soft px-3 py-2 text-sm"><span className="min-w-0 truncate">{last.name} · {outcomeLabel(last.status,day)} saved</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>followup(null)}>Undo last entry</Button></div>:<p className="text-sm text-muted">Each outcome you select is saved straight away and opens the next student.</p>}</div>
    {lead?<><div><p className="text-sm text-muted">{[lead.file,lead.campaign].filter(Boolean).join(' · ')}</p><h2 className="section-title">{lead.name}</h2><p className="num text-3xl font-bold">{lead.phone}</p>{lead.course&&<p>{lead.course}</p>}</div>
    <label className="block text-sm font-semibold">Additional remarks (optional)<textarea className="mt-2 block w-full rounded-lg border border-input-line p-3" rows={2} maxLength={2000} value={remarks} disabled={busy} onChange={e=>setRemarks(e.target.value)}/></label>
    <fieldset disabled={busy} className="grid grid-cols-2 gap-2 sm:grid-cols-3"><legend className="mb-2 font-semibold">How did the call go?</legend>
    {(Object.keys(CALL_LABELS) as ManualOutcome[]).map(status=><Button key={status} variant="outline" onClick={()=>chooseOutcome(status)}>{outcomeLabel(status,day)}</Button>)}</fieldset></>:<p>No eligible leads are due. Your report is available above.</p>}
    {scheduling&&<div className="space-y-3 rounded-lg bg-sand p-4">
      <div className="flex flex-wrap gap-2">{[['In 2 hours',2],['Tomorrow',24]].map(([label,hours])=><Button key={label} size="sm" disabled={busy} onClick={()=>save('callback',new Date(Date.now()+Number(hours)*3600000).toISOString())}>{label}</Button>)}</div>
      <Field label="Choose callback time (IST)" type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy||!selectedTime||Date.parse(selectedTime)<=Date.now()} onClick={()=>save('callback',selectedTime)}>Schedule callback</Button>
        <Button variant="ghost" disabled={busy} onClick={()=>{setScheduling(null);setWhen('');}}>Cancel</Button>
      </div>
    </div>}
    {last?.status==='interested'&&!last.done&&!scheduling&&<div className="space-y-3 rounded-lg border border-line p-4">
      <p className="text-sm"><strong>Optional for {last.name}:</strong> book a branch visit or set a callback. You can skip this; {last.name} is already on your Centre Head’s Interested follow-ups.</p>
      <Field label="Date and time (IST)" type="datetime-local" value={followWhen} onChange={e=>setFollowWhen(e.target.value)}/>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy||!followTime} onClick={()=>followup(followTime)}>Book branch visit</Button>
        <Button size="sm" variant="outline" disabled={busy||!followTime} onClick={()=>followup(null,followTime)}>Set callback</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={()=>setLast({...last,done:'skipped'})}>Skip</Button>
      </div>
    </div>}
    <p role="status">{busy?'Saving…':notice}</p>
  </section>;
}
