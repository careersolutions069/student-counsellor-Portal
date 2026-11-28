'use server';
import { UPLOAD_SIZE_ERROR } from '@/lib/upload-limits';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth';
import {userMessage} from '@/lib/errors';
import { adminClient } from '@/lib/supabase/server';
import { documentActor,accessDocument } from '@/lib/document-access';
import { DOCUMENT_BUCKET,DOCUMENT_STATUSES,MAX_DOCUMENT_SIZE,validateDocumentFile,definiteUploadRollback } from '@/lib/student-documents';
import type { ActionState } from '@/app/actions';
function refreshDocuments() {
 for(const path of ['/branch','/owner','/student']) revalidatePath(path);
}
function failure(error:unknown):ActionState {
 return {error:userMessage(error,'Unable to save. Refresh and try again.')};
}
export async function toggleStudentUploads(_:ActionState,form:FormData):Promise<ActionState> {
 const {client}=await requireStaff(['owner','centre_head']);
 try {
  const id=z.uuid().parse(form.get('student_id'));
  const enabled=form.get('allow_student_upload')==='on';
  const {data,error}=await client.from('students').update({allow_student_upload:enabled}).eq('id',id).select('id').single();
  if(error||!data) throw new Error('Unable to change upload permission.');
  refreshDocuments();
  return {success:enabled?'Student uploads allowed.':'Student uploads disabled.'};
 } catch(error) {return failure(error);}
}
export async function addDocument(_:ActionState,form:FormData):Promise<ActionState> {
 const {client}=await requireStaff(['owner','centre_head']);
 try {
  const studentId=z.uuid().parse(form.get('student_id'));
  const name=z.string().trim().min(1,'Enter a document name.').max(150).parse(form.get('document_name'));
  const {data:student}=await client.from('students').select('branch_id').eq('id',studentId).single();
  if(!student) throw new Error('Student unavailable.');
  const {error}=await client.from('student_documents').insert({student_id:studentId,branch_id:student.branch_id,document_name:name});
  if(error) throw new Error(error.code==='23505'?'This checklist item already exists.':'Unable to add document.');
  refreshDocuments(); return {success:'Checklist item added.'};
 } catch(error) {return failure(error);}
}
export async function updateDocument(_:ActionState,form:FormData):Promise<ActionState> {
 const {client}=await requireStaff(['owner','centre_head']);
 try {
  const id=z.uuid().parse(form.get('document_id'));
  const status=z.enum(DOCUMENT_STATUSES).parse(form.get('status'));
  const remarks=z.string().trim().max(2000).parse(form.get('remarks')||'');
  const version=z.iso.datetime({offset:true}).parse(form.get('updated_at'));
  const {data,error}=await client.from('student_documents').update({status,remarks:remarks||null}).eq('id',id).eq('updated_at',version).select('id').single();
  if(error||!data) throw new Error('Unable to update. Uploaded and Verified require a file; refresh if this document changed.');
  refreshDocuments(); return {success:'Document status updated.'};
 } catch(error) {return failure(error);}
}
async function upload(form:FormData,student:boolean):Promise<ActionState> {
 let staged:string|undefined;
 let finalizing=false;
 let finalizationError:{code?:string}|null=null;
 const storage=adminClient().storage.from(DOCUMENT_BUCKET);
 try {
  const actor=await documentActor(student);
  const id=z.uuid().parse(form.get('document_id'));
  const doc=await accessDocument(id,actor,true);
  const expected=z.iso.datetime({offset:true}).parse(form.get('updated_at'));
  if(doc.updated_at!==expected) throw new Error('Document changed. Refresh before uploading.');
  const file=form.get('file');
  if(!(file instanceof File)||!file.size) throw new Error('Choose a non-empty file.');
  if(file.size>MAX_DOCUMENT_SIZE) throw new Error(UPLOAD_SIZE_ERROR);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const {extension,mime}=validateDocumentFile(file,bytes);
  const name=file.name.split(/[/\\]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180);
  staged=`${doc.student_id}/${doc.id}/${randomUUID()}.${extension}`;
  const {error:uploadError}=await storage.upload(staged,bytes,{contentType:mime,upsert:false,cacheControl:'0'});
  if(uploadError) throw new Error('Upload failed. Please try again.');
  const status=student?'Uploaded':z.enum(['Uploaded','Verified']).parse(form.get('status')||'Uploaded');
  finalizing=true;
  const {data:oldPath,error}=await adminClient().rpc('finalize_document_upload',{
   document_id:id,new_path:staged,new_name:name,new_status:status,expected_updated_at:expected,...actor,
  });
  if(error) {finalizationError=error;throw new Error('Unable to confirm the upload. Refresh to check its status before trying again.');}
  staged=undefined;
  if(oldPath) {
   const {error:cleanupError}=await storage.remove([oldPath]);
   if(cleanupError) console.error('Old document object cleanup failed',id);
  }
  refreshDocuments(); return {success:'Document uploaded successfully.'};
 } catch(error) {
  // shortcut: preserve uncertain uploads after transport failures; reconcile orphan objects during storage maintenance.
  if(staged && (!finalizing || definiteUploadRollback(finalizationError))) {
   const {error:cleanupError}=await storage.remove([staged]);
   if(cleanupError) console.error('Staged document object cleanup failed');
  }
  return failure(error);
 }
}
export async function uploadStudentDocument(_:ActionState,form:FormData) {return upload(form,true);}
export async function uploadStaffDocument(_:ActionState,form:FormData) {return upload(form,false);}
