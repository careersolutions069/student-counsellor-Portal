import { UploadField } from '@/components/upload-field';
import { ActionForm } from '@/components/action-form';
import { Field,Select } from '@/components/fields';
import { StatusBadge } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { DOCUMENT_STATUSES,STANDARD_DOCUMENTS,type StudentDocument } from '@/lib/student-documents';
import { addDocument,toggleStudentUploads,updateDocument,uploadStaffDocument,uploadStudentDocument } from '@/app/documents/actions';
function FileUpload({doc,student}:{doc:StudentDocument;student:boolean}) {
 return <ActionForm key={doc.updated_at} action={student?uploadStudentDocument:uploadStaffDocument} submit={doc.has_file?'Replace file':'Upload file'} className="mt-3 rounded-xl border-[1.5px] border-dashed border-[#9CC9C1] bg-[#F4FAF8] p-3.5">
  <input type="hidden" name="document_id" value={doc.id}/><input type="hidden" name="updated_at" value={doc.updated_at}/>
  <UploadField label={`File for ${doc.document_name}`} name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required className="h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-soft file:px-3 file:py-1.5 file:font-semibold file:text-primary"/>
  <p className="text-[13px] text-[#3E4F59]">PDF, JPG or PNG · up to 4 MB</p>
  {!student&&<Select label="Status after upload" name="status" defaultValue="Uploaded"><option>Uploaded</option><option>Verified</option></Select>}
 </ActionForm>;
}
function summary(documents:StudentDocument[]) {
 const order:[string,string][]=[['Re-upload Needed','needs re-upload'],['Pending','pending'],['Uploaded','uploaded'],['Verified','verified']];
 return order.map(([status,label])=>[documents.filter(d=>d.status===status).length,label] as const).filter(([count])=>count).map(([count,label])=>`${count} ${label}`).join(' · ');
}
const ORDER=['Re-upload Needed','Pending','Uploaded','Verified'];
/** Student view: list rows on mobile, table-like grid from 1024 px. */
function StudentDocumentList({documents,allowUpload}:{documents:StudentDocument[];allowUpload:boolean}) {
 const needsAction=documents.some(d=>d.status!=='Verified');
 return <section aria-labelledby="docs" className="overflow-hidden rounded-[18px] border border-line bg-white lg:rounded-[20px]">
  <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 pb-3.5 pt-5 lg:px-6">
   <div><h2 id="docs" className="text-[21px] font-bold tracking-[-0.015em] text-navy lg:text-2xl">My documents</h2>{documents.length>0&&<p className="mt-0.5 text-sm text-muted">{summary(documents)}</p>}</div>
   <p className="rounded-lg bg-[#F5F2EB] px-3 py-1.5 text-sm text-[#3E4F59]">Accepted: PDF, JPG or PNG · up to 4 MB per file</p>
  </div>
  {!allowUpload&&needsAction&&<p className="mx-4 mb-4 flex gap-2.5 rounded-xl bg-neutral-bg p-3 text-sm text-neutral lg:mx-6">Uploading from this page is turned off by your branch. Your counsellor will tell you how to share these documents.</p>}
  {!documents.length&&<p className="px-4 pb-5 text-muted lg:px-6">Your centre has not added any document checklist items yet.</p>}
  {documents.length>0&&<div className="hidden grid-cols-[24%_16%_minmax(0,1fr)_26%] border-y border-line bg-[#FBF9F4] text-[13px] font-semibold text-muted lg:grid" aria-hidden="true"><span className="px-4 py-3">Document</span><span className="px-4 py-3">Status</span><span className="px-4 py-3">Note from your branch</span><span/></div>}
  <ul>{[...documents].sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status)).map(doc=>{
   const fix=doc.status==='Re-upload Needed';
   const canUpload=allowUpload&&doc.status!=='Verified';
   return <li key={doc.id} id={`doc-${doc.id}`} className={`scroll-mt-6 border-t border-sand first:border-t-0 lg:grid lg:grid-cols-[24%_16%_minmax(0,1fr)_26%] ${fix?'bg-[#FFFBF7]':''}`}>
    <div className="flex items-start justify-between gap-3 px-4 pt-4 lg:block lg:pb-4"><h3 className="font-semibold">{doc.document_name}</h3><span className="lg:hidden"><StatusBadge status={doc.status}/></span></div>
    <div className="hidden px-4 py-4 lg:block"><StatusBadge status={doc.status}/></div>
    <div className="px-4 pt-2 text-sm lg:py-4">{doc.remarks?<div className={fix?'rounded-xl bg-warning-bg p-3 text-[#6B2A0A] lg:bg-transparent lg:p-0':'text-[#3E4F59]'}><strong className="block text-xs uppercase tracking-[0.03em]">{fix?'What to fix':<span className="lg:hidden">Note from your branch</span>}</strong><span className="whitespace-pre-line">{doc.remarks}</span></div>:<span className="hidden text-muted lg:inline">{doc.status==='Uploaded'?'Waiting for your branch to check':'—'}</span>}</div>
    <div className="px-4 pb-4 pt-3 lg:py-4">
     <div className="flex flex-wrap items-start gap-2">{doc.has_file&&<Button asChild variant="neutral" size="sm"><a href={`/documents/${doc.id}?as=student`} target="_blank" rel="noreferrer">View file</a></Button>}
     {canUpload&&<details className="open:basis-full"><summary className={`inline-flex min-h-10 list-none items-center rounded-[10px] px-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden ${fix?'bg-primary text-white hover:bg-primary-hover':'border-[1.5px] border-primary bg-white text-primary hover:bg-teal-soft'}`}>{doc.has_file?'Replace file':'Upload file'}</summary><FileUpload doc={doc} student/></details>}</div>
    </div>
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
  <div className="grid gap-4 xl:grid-cols-2">{documents.map(doc=><article key={doc.id} className="min-w-0 rounded-xl border border-line bg-white p-5">
   <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{doc.document_name}</h3><StatusBadge status={doc.status}/></div>
   {doc.file_name&&<p className="mt-3 break-words text-sm text-muted">{doc.file_name}</p>}
   {doc.remarks&&<p className="mt-3 whitespace-pre-line text-sm text-[#3E4F59]">{doc.remarks}</p>}
   {doc.has_file&&<div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline"><a href={`/documents/${doc.id}?as=${student?'student':'staff'}`} target="_blank" rel="noreferrer">View File</a></Button><Button asChild variant="outline"><a href={`/documents/${doc.id}?as=${student?'student':'staff'}&download=1`} target="_blank" rel="noreferrer">Download File</a></Button></div>}
   {!student&&<ActionForm key={`status-${doc.updated_at}`} action={updateDocument} submit="Update document status" variant="outline" className="mt-5">
    <input type="hidden" name="document_id" value={doc.id}/><input type="hidden" name="updated_at" value={doc.updated_at}/>
    <Select label={`Status for ${doc.document_name}`} name="status" defaultValue={doc.status}>{DOCUMENT_STATUSES.map(status=><option key={status}>{status}</option>)}</Select>
    <Field label={`Remark for ${doc.document_name}`} name="remarks" defaultValue={doc.remarks||''} maxLength={2000}/>
   </ActionForm>}
   {(!student || (allowUpload&&doc.status!=='Verified'))&&<details className="mt-4"><summary className="font-semibold text-primary">{doc.has_file?'Replace File':'Upload File'}</summary><FileUpload doc={doc} student={student}/></details>}
  </article>)}</div>
 </section>;
}
