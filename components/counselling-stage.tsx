'use client';
import { useCallback, useEffect, useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { FileRow } from '@/components/file-row';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/shell';
import { getCounsellingWorkspace, saveCounsellingStates, uploadCounsellingPdf, reuseCounsellingChoice, recordCounsellingOutcome, setCounsellingVisibility } from '@/app/counselling/actions';
import { INDIAN_STATES, documentLabel, stageCategory, slotUnlocked, type Category, type CounsellingDocument, type CounsellingWorkspace } from '@/lib/counselling';
import type { ActionState } from '@/app/actions';
type Save = (state:ActionState,form:FormData)=>Promise<ActionState>;
function Version({doc}:{doc?:CounsellingDocument}) {
 return <><input type="hidden" name="document_id" value={doc?.id||''}/><input type="hidden" name="created_at" value={doc?.created_at||''}/></>;
}
function States({initial,save}:{initial:string[];save:Save}) {
 const [selected,setSelected]=useState(initial);
 return <ActionForm action={save} submit="Save States" variant="outline">
  <details className="rounded-lg border border-line p-4"><summary className="font-medium">Preferred states · {selected.length}/5 selected</summary>
   <div className="mt-4 grid max-h-64 gap-3 overflow-y-auto sm:grid-cols-2">{INDIAN_STATES.map(state=><label key={state} className="flex items-center gap-2 text-sm"><input type="checkbox" name="preferred_states" value={state} checked={selected.includes(state)} disabled={selected.length===5&&!selected.includes(state)} onChange={event=>setSelected(event.target.checked?[...selected,state]:selected.filter(s=>s!==state))}/>{state}</label>)}</div>
  </details>
  <p className="text-sm text-muted">{selected.length?selected.join(', '):'Choose up to 5 states or union territories. You can change these anytime.'}</p>
 </ActionForm>;
}
function Workspace({studentId}:{studentId:string}) {
 const [data,setData]=useState<CounsellingWorkspace>();
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const reload=useCallback(async()=>{
  setLoading(true);setError('');
  try {const result=await getCounsellingWorkspace(studentId);if(result.workspace)setData(result.workspace);else setError(result.error||'Unable to load counselling.');}
  catch {setError('Unable to load counselling. Try again.');}finally{setLoading(false);}
 },[studentId]);
 useEffect(()=>{void reload();},[reload]);
 function save(action:Save):Save {return async(previous,form)=>{form.set('student_id',studentId);const result=await action(previous,form);if(result.success)await reload();return result;};}
 function doc(category:Category,phase:number|null=null){return data?.documents.find(d=>d.doc_category===category&&d.phase_number===phase);}
 function fileCard(document:CounsellingDocument) {
  return <div className="space-y-3 rounded-lg bg-[#FBF9F4] p-4">
   <p className="break-words text-sm">{document.file_name}</p>
   {document.reused_from_doc_id&&<p className="text-xs text-muted">Reused choice PDF · preserved copy</p>}
   <Badge>{document.show_to_student?'Shared with Student':'Hidden from Student'}</Badge>
   <div className="flex flex-wrap gap-2"><Button asChild variant="neutral" size="sm"><a href={`/counselling-documents/${document.id}`} target="_blank" rel="noreferrer">View PDF</a></Button><Button asChild variant="neutral" size="sm"><a href={`/counselling-documents/${document.id}?download=1`} target="_blank" rel="noreferrer">Download PDF</a></Button></div>
   <ActionForm key={`visibility-${document.created_at}-${document.show_to_student}`} action={save(setCounsellingVisibility)} submit={document.show_to_student?'Hide from Student':'Show to Student'} variant="outline">
    <Version doc={document}/><input type="hidden" name="show_to_student" value={String(!document.show_to_student)}/>
   </ActionForm>
  </div>;
 }
 function slot(category:Category,phase:number|null=null,inherited=false) {
  if(!data)return null;
  const document=doc(category,phase);
  const unlocked=slotUnlocked(category,phase,data.state,data.documents);
  return <section className="space-y-4 rounded-xl border border-line p-4" aria-label={documentLabel(category,phase)}>
   <h4 className="font-semibold">{documentLabel(category,phase)}{category==='choice_pdf'?' (Required)':''}</h4>
   {document&&fileCard(document)}
   {inherited?<p className="text-sm text-muted">{document?'Inherited from the same stage group. No re-upload needed.':'No stage document yet. Add it in the first phase of this group.'}</p>:unlocked?<>
    <ActionForm key={`upload-${category}-${phase}`} action={save(uploadCounsellingPdf)} submit="Upload" hideSubmit>
     {pending=><>
      <Version doc={document}/><input type="hidden" name="doc_category" value={category}/><input type="hidden" name="phase_number" value={phase||''}/>
      <FileRow label={documentLabel(category,phase)} name="file" accept=".pdf,application/pdf" mode="submit" busy={pending}
       hint="PDF only · up to 4 MB. New and replacement PDFs stay hidden from the student until you share them."
       current={document?{name:document.file_name||'Uploaded PDF'}:null}
       leading={<p className="font-semibold text-ink">{document?'Replace this PDF':'Add the PDF'}</p>}/>
     </>}
    </ActionForm>
    {category==='choice_pdf'&&data.documents.filter(d=>d.doc_category==='choice_pdf'&&d.phase_number!<phase!).sort((a,b)=>a.phase_number!-b.phase_number!).map(source=><ActionForm key={`reuse-${source.id}-${source.created_at}-${document?.created_at}`} action={save(reuseCounsellingChoice)} submit={`Use Same Choice PDF from Phase ${source.phase_number}`} variant="outline"><Version doc={document}/><input type="hidden" name="phase_number" value={phase!}/><input type="hidden" name="source_doc_id" value={source.id}/></ActionForm>)}
   </>:<p className="text-sm text-muted">Upload the corresponding choice PDF first.</p>}
  </section>;
 }
 return <div className="mt-5 space-y-5" aria-busy={loading}>
  {error&&<p role="alert" className="text-sm text-danger-text">{error}</p>}
  <Button type="button" variant="outline" onClick={()=>void reload()} disabled={loading}>{loading?'Loading counselling…':'Refresh counselling'}</Button>
  {data&&<>
   <States key={data.state.preferred_states.join('|')} initial={data.state.preferred_states} save={save(saveCounsellingStates)}/>
   {slot('security_deposit')}
   <div className="space-y-4" aria-label="Counselling phases">{[1,2,3,4,5,6].map(phase=>{
    const unlocked=phase<=data.state.current_phase;
    const active=phase===data.state.current_phase&&!data.state.finished;
    const allotted=phase===data.state.allotted_phase;
    const status=!unlocked?'Locked':allotted?'College Allotted':phase<data.state.current_phase||data.state.finished?'Not Allotted':'Active';
    return <details key={`${phase}-${data.state.current_phase}-${data.state.finished}`} open={phase===data.state.current_phase} className="rounded-xl border border-line p-4">
     <summary className="font-semibold">Phase {phase} · {status}</summary>
     {unlocked?<div className="mt-4 space-y-4">
      {slot(stageCategory(phase),null,[2,3,5].includes(phase))}
      {slot('choice_pdf',phase)}
      {active&&<div className="flex flex-wrap gap-4">{['not_allotted','allotted'].map(outcome=><ActionForm key={outcome} action={save(recordCounsellingOutcome)} submit={outcome==='allotted'?'College Allotted':phase===6?'Not Allotted – Finish Phase 6':`Not Allotted – Proceed to Phase ${phase+1}`} disabled={!doc('choice_pdf',phase)} variant="outline"><input type="hidden" name="phase_number" value={phase}/><input type="hidden" name="outcome" value={outcome}/></ActionForm>)}</div>}
      {allotted&&slot('allotment_letter',phase)}
     </div>:<p className="mt-3 text-sm text-muted">Mark Phase {phase-1} Not Allotted to unlock this phase.</p>}
    </details>;
   })}</div>
   {(data.state.allotted_phase!==null||data.documents.some(d=>d.doc_category==='allotment_letter'))&&<div className="grid gap-5 xl:grid-cols-2"><section className="space-y-4"><h3 className="section-title">New College Choice</h3>{slot('new_choice_pdf')}{slot('new_allotment_letter')}</section><section className="space-y-4"><h3 className="section-title">Upgrade College</h3>{slot('upgrade_choice_pdf')}{slot('upgraded_allotment_letter')}</section></div>}
   {data.state.finished&&data.state.allotted_phase===null&&<p role="status" className="text-sm text-[#3E4F59]">All six phases finished without allotment. Preferred states and unlocked documents remain editable.</p>}
  </>}
 </div>;
}
export function CounsellingStage({studentId}:{studentId:string}) {
 const [opened,setOpened]=useState(false);
 return <details className="rounded-xl border border-[#9CC9C1] p-5" onToggle={event=>{if(event.currentTarget.open)setOpened(true);}}><summary className="font-semibold text-navy">Counselling Stage</summary>{opened&&<Workspace studentId={studentId}/>}</details>;
}
