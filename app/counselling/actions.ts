'use server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/server';
import { DOCUMENT_BUCKET, definiteUploadRollback } from '@/lib/student-documents';
import { MAX_UPLOAD_SIZE, UPLOAD_SIZE_ERROR } from '@/lib/upload-limits';
import { validateCollegePdf } from '@/lib/visit-conversion';
import { preferredStatesSchema, slotSchema, slotUnlocked, documentLabel, type CounsellingWorkspace } from '@/lib/counselling';
import type { ActionState } from '@/app/actions';
type Client = Awaited<ReturnType<typeof requireStaff>>['client'];
const optionalId = z.uuid().nullable();
const optionalTime = z.iso.datetime({offset:true}).nullable();
function failure(error: unknown): ActionState {
  return {error:error instanceof z.ZodError ? error.issues[0].message : error instanceof Error ? error.message : 'Unable to save counselling details. Refresh and try again.'};
}
async function workspace(client:Client, studentId:string):Promise<CounsellingWorkspace> {
  z.uuid().parse(studentId);
  const {data:student,error}=await client.from('students').select('id,branch_id').eq('id',studentId).single();
  if(error||!student)throw new Error('Student unavailable. Check your branch access.');
  const [state,documents]=await Promise.all([
    client.from('student_counselling').select('*').eq('student_id',studentId).eq('branch_id',student.branch_id).maybeSingle(),
    client.from('counselling_documents').select('*').eq('student_id',studentId).eq('branch_id',student.branch_id).order('created_at'),
  ]);
  if(state.error||documents.error)throw new Error('Unable to load counselling details.');
  return {branch_id:student.branch_id,state:state.data||{preferred_states:[],current_phase:1,allotted_phase:null,finished:false},documents:documents.data||[]};
}
export async function getCounsellingWorkspace(studentId:string):Promise<{workspace?:CounsellingWorkspace;error?:string}> {
  const {client}=await requireStaff(['owner','centre_head']);
  try{return {workspace:await workspace(client,studentId)};}catch(error){return failure(error);}
}
export async function saveCounsellingStates(_:ActionState,form:FormData):Promise<ActionState> {
  const {client}=await requireStaff(['owner','centre_head']);
  try {
    const target=z.uuid().parse(form.get('student_id'));
    const states=preferredStatesSchema.parse(form.getAll('preferred_states'));
    const {error}=await client.rpc('save_counselling_states',{target,states});
    if(error)throw new Error('Unable to save states. Refresh and check your access.');
    return {success:'Preferred states saved.'};
  }catch(error){return failure(error);}
}
export async function recordCounsellingOutcome(_:ActionState,form:FormData):Promise<ActionState> {
  const {client}=await requireStaff(['owner','centre_head']);
  try {
    const target=z.uuid().parse(form.get('student_id'));
    const expected_phase=z.coerce.number().int().min(1).max(6).parse(form.get('phase_number'));
    const outcome=z.enum(['allotted','not_allotted']).parse(form.get('outcome'));
    const {error}=await client.rpc('counselling_outcome',{target,expected_phase,outcome});
    if(error)throw new Error('Unable to change phase. A Choice PDF is required; refresh if the phase changed or finished.');
    return {success:outcome==='allotted'?'College allotted. Upload the allotment letter.':expected_phase===6?'Phase 6 finished without allotment.':'Next phase unlocked.'};
  }catch(error){return failure(error);}
}
async function removeOld(path:string|null) {
  if(path){const {error}=await adminClient().storage.from(DOCUMENT_BUCKET).remove([path]);if(error)console.error('Unreferenced counselling PDF cleanup failed');}
}
export async function reuseCounsellingChoice(_:ActionState,form:FormData):Promise<ActionState> {
  const {client}=await requireStaff(['owner','centre_head']);
  try {
    const target=z.uuid().parse(form.get('student_id'));
    const phase=z.coerce.number().int().min(2).max(6).parse(form.get('phase_number'));
    const source_doc_id=z.uuid().parse(form.get('source_doc_id'));
    const expected_id=optionalId.parse(form.get('document_id')||null);
    const expected_created_at=optionalTime.parse(form.get('created_at')||null);
    const {data,error}=await client.rpc('reuse_counselling_choice',{target,phase,source_doc_id,expected_id,expected_created_at});
    if(error)throw new Error('Unable to reuse this PDF. Refresh and choose an earlier unlocked phase.');
    await removeOld(data);
    return {success:'Choice PDF reused. Hidden from the student until you share it.'};
  }catch(error){return failure(error);}
}
export async function setCounsellingVisibility(_:ActionState,form:FormData):Promise<ActionState> {
  const {client}=await requireStaff(['owner','centre_head']);
  try {
    const id=z.uuid().parse(form.get('document_id'));
    const version=z.iso.datetime({offset:true}).parse(form.get('created_at'));
    const show=z.enum(['true','false']).parse(form.get('show_to_student'))==='true';
    const {data,error}=await client.from('counselling_documents').update({show_to_student:show}).eq('id',id).eq('created_at',version).select('id').single();
    if(error||!data)throw new Error('Document changed or unavailable. Refresh before sharing.');
    return {success:show?'Document shared with the student.':'Document hidden from the student.'};
  }catch(error){return failure(error);}
}
export async function uploadCounsellingPdf(_:ActionState,form:FormData):Promise<ActionState> {
  const {client,staff}=await requireStaff(['owner','centre_head']);
  let staged:string|undefined;
  let finalizing=false;
  let finalizationError:{code?:string}|null=null;
  const storage=adminClient().storage.from(DOCUMENT_BUCKET);
  try {
    const target=z.uuid().parse(form.get('student_id'));
    const slot=slotSchema.parse({doc_category:form.get('doc_category'),phase_number:form.get('phase_number')?Number(form.get('phase_number')):null});
    const expected_id=optionalId.parse(form.get('document_id')||null);
    const expected_created_at=optionalTime.parse(form.get('created_at')||null);
    const data=await workspace(client,target);
    if(!slotUnlocked(slot.doc_category,slot.phase_number,data.state,data.documents))throw new Error('This document slot is locked. Refresh counselling progress.');
    const file=form.get('file');
    if(!(file instanceof File)||!file.size)throw new Error('Choose a non-empty PDF.');
    if(file.size>MAX_UPLOAD_SIZE)throw new Error(UPLOAD_SIZE_ERROR);
    const bytes=new Uint8Array(await file.arrayBuffer());validateCollegePdf(file,bytes);
    staged=`${data.branch_id}/${target}/counselling/${randomUUID()}.pdf`;
    const name=file.name.split(/[/\\]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180);
    const uploaded=await storage.upload(staged,bytes,{contentType:'application/pdf',upsert:false,cacheControl:'0'});
    if(uploaded.error)throw new Error('PDF upload failed. Try again.');
    finalizing=true;
    const result=await adminClient().rpc('finalize_counselling_upload',{target,staff_actor:staff.id,expected_branch:data.branch_id,category:slot.doc_category,phase:slot.phase_number,new_path:staged,new_name:name,doc_label:documentLabel(slot.doc_category,slot.phase_number),expected_id,expected_created_at});
    if(result.error){finalizationError=result.error;throw new Error('Unable to confirm the upload. Refresh to check the document, phase and your access before retrying.');}
    staged=undefined;await removeOld(result.data);
    return {success:'PDF saved. Hidden from the student until you share it.'};
  }catch(error){
    // Preserve uncertain uploads rather than delete a possibly committed/reused file.
    if(staged&&(!finalizing||definiteUploadRollback(finalizationError)))await removeOld(staged);
    return failure(error);
  }
}
