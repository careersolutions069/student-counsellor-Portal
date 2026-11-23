import { DocumentUpload } from '@/components/document-upload';
import { ActionForm } from '@/components/action-form';
import { Field,Select } from '@/components/fields';
import { StatusBadge } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { DOCUMENT_STATUSES,STANDARD_DOCUMENTS,type StudentDocument } from '@/lib/student-documents';
import { addDocument,toggleStudentUploads,updateDocument } from '@/app/documents/actions';
function summary(documents:StudentDocument[]) {
 const order:[string,string][]=[['Re-upload Needed','needs re-upload'],['Pending','pending'],['Uploaded','uploaded'],['Verified','verified']];
 return order.map(([status,label])=>[documents.filter(d=>d.status===status).length,label] as const).filter(([count])=>count).map(([count,label])=>`${count} ${label}`).join(' · ');
}
const ORDER=['Re-upload Needed','Pending','Uploaded','Verified'];
/** Student view: one row per document — details on the left, View file and Upload on the right. */
function StudentDocumentList({documents,allowUpload}:{documents:StudentDocument[];allowUpload:boolean}) {
 const needsAction=documents.some(d=>d.status!=='Verified');
 return <section aria-labelledby="docs" className="overflow-hidden rounded-[18px] border border-line bg-white lg:rounded-[20px]">
  <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 pb-3.5 pt-5 lg:px-6">
   <div><h2 id="docs" className="text-[21px] font-bold tracking-[-0.015em] text-navy lg:text-2xl">My documents</h2>{documents.length>0&&<p className="mt-0.5 text-sm text-muted">{summary(documents)}</p>}</div>
   <p className="rounded-lg bg-[#F5F2EB] px-3 py-1.5 text-sm text-[#3E4F59]">Accepted: PDF, JPG or PNG · up to 4 MB per file</p>
  </div>
  {!allowUpload&&needsAction&&<p className="mx-4 mb-4 flex gap-2.5 rounded-xl bg-neutral-bg p-3 text-sm text-neutral lg:mx-6">Uploading from this page is turned off by your branch. Your counsellor will tell you how to share these documents.</p>}
  {!documents.length&&<p className="px-4 pb-5 text-muted lg:px-6">Your centre has not added any document checklist items yet.</p>}
  <ul className="border-t border-line">{[...documents].sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status)).map(doc=>{
   const fix=doc.status==='Re-upload Needed';
   const canUpload=allowUpload&&doc.status!=='Verified';
   const leading=<div className="space-y-1.5">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="font-semibold text-ink">{doc.document_name}</h3><StatusBadge status={doc.status}/></div>
    {doc.remarks?<div className={`text-sm ${fix?'rounded-xl bg-warning-bg p-3 text-[#6B2A0A]':'text-[#3E4F59]'}`}><strong className="block text-xs uppercase tracking-[0.03em]">{fix?'What to fix':'Note from your branch'}</strong><span className="whitespace-pre-line">{doc.remarks}</span></div>:doc.status==='Uploaded'&&<p className="text-sm text-muted">Waiting for your branch to check</p>}
   </div>;
   return <li key={doc.id} id={`doc-${doc.id}`} className={`scroll-mt-6 border-t border-sand px-4 py-4 first:border-t-0 lg:px-6 ${fix?'bg-[#FFFBF7]':''}`}>
    {canUpload?<DocumentUpload doc={doc} student leading={leading}/>:<div className="flex items-start justify-between gap-3">
     <div className="min-w-0 flex-1">{leading}{doc.has_file&&doc.file_name&&<p className="mt-1 text-sm text-[#3E4F59]">Current file: <span className="break-all font-medium">{doc.file_name}</span></p>}</div>
     {doc.has_file&&<Button asChild variant="neutral" size="sm" className="shrink-0"><a href={`/documents/${doc.id}?as=student`} target="_blank" rel="noreferrer">View file<span className="sr-only">: {doc.document_name}</span></a></Button>}
    </div>}
   </li>;})}</ul>
 </section>;
}
export function StudentDocuments({documents,allowUpload,studentId,student=false}:{documents:StudentDocument[];allowUpload:boolean;studentId?:string;student?:boolean}) {
 if(student) return <StudentDocumentList documents={documents} allowUpload={allowUpload}/>;
 return <section className="space-y-5" aria-label={student?'My Documents':'Documents'}>
  <div><h2 className="section-title">{student?'My Documents':'Documents'}</h2><p className="mt-2 text-sm text-muted">{student?'Your document checklist and verification status.':'Manage this student’s checklist, files and verification.'}</p></div>
  {!student&&<>
   <ActionForm action={toggleStudentUploads} submit="Save upload permission" variant="outline">
    <input type="hidden" name="student_id" value={studentId}/>
    <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" name="allow_student_upload" defaultChecked={allowUpload}/>Allow Student to Upload Documents</label>
   </ActionForm>
   <details className="rounded-lg border border-line p-4"><summary className="font-semibold text-primary">Add checklist item</summary>
    <div className="mt-4 space-y-4"><ActionForm action={addDocument} submit="Add standard document" variant="outline"><input type="hidden" name="student_id" value={studentId}/><Select label="Standard document" name="document_name">{STANDARD_DOCUMENTS.map(name=><option key={name}>{name}</option>)}</Select></ActionForm>
    <ActionForm action={addDocument} submit="Add custom document" variant="outline"><input type="hidden" name="student_id" value={studentId}/><Field label="Custom document name" name="document_name" maxLength={150} required/></ActionForm></div>
   </details>
  </>}
  {!documents.length&&<p className="text-sm text-muted">Your centre has not added any document checklist items yet.</p>}
  <div className="grid gap-4 xl:grid-cols-2">{documents.map(doc=><article key={doc.id} className="min-w-0 space-y-4 rounded-xl border border-line bg-white p-3 sm:p-5">
   <DocumentUpload doc={doc} student={false}
    leading={<div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="font-semibold text-ink">{doc.document_name}</h3><StatusBadge status={doc.status}/></div>}
>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#3E4F59]">
     <label className="flex items-center gap-2">Mark the new file as
      <select name="status" defaultValue="Uploaded" className="h-10 rounded-[10px] border-[1.5px] border-input-line bg-white px-2 text-sm text-ink focus-visible:border-primary"><option>Uploaded</option><option>Verified</option></select>
     </label>
     {doc.has_file&&<a href={`/documents/${doc.id}?as=staff&download=1`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center font-semibold text-primary underline-offset-4 hover:underline">Download current file<span className="sr-only">: {doc.document_name}</span></a>}
    </div>
   </DocumentUpload>
   {doc.remarks&&<p className="whitespace-pre-line text-sm text-[#3E4F59]">{doc.remarks}</p>}
   <details className="border-t border-sand pt-3"><summary className="min-h-10 py-1 text-sm font-semibold text-primary">Change status or remark</summary>
    <ActionForm key={`status-${doc.updated_at}`} action={updateDocument} submit="Update document status" variant="outline" className="mt-3">
     <input type="hidden" name="document_id" value={doc.id}/><input type="hidden" name="updated_at" value={doc.updated_at}/>
     <Select label={`Status for ${doc.document_name}`} name="status" defaultValue={doc.status}>{DOCUMENT_STATUSES.map(status=><option key={status}>{status}</option>)}</Select>
     <Field label={`Remark for ${doc.document_name}`} name="remarks" defaultValue={doc.remarks||''} maxLength={2000}/>
    </ActionForm>
   </details>
  </article>)}</div>
 </section>;
}
