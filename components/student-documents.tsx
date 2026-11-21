import { UploadField } from '@/components/upload-field';
import { ActionForm } from '@/components/action-form';
import { Field,Select } from '@/components/fields';
import { Badge } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { DOCUMENT_STATUSES,STANDARD_DOCUMENTS,type StudentDocument } from '@/lib/student-documents';
import { addDocument,toggleStudentUploads,updateDocument,uploadStaffDocument,uploadStudentDocument } from '@/app/documents/actions';
function FileUpload({doc,student}:{doc:StudentDocument;student:boolean}) {
 return <ActionForm key={doc.updated_at} action={student?uploadStudentDocument:uploadStaffDocument} submit={doc.has_file?'Replace File':'Upload File'} className="mt-4">
  <input type="hidden" name="document_id" value={doc.id}/><input type="hidden" name="updated_at" value={doc.updated_at}/>
  <UploadField label={`File for ${doc.document_name}`} name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required/>
  <p className="text-xs text-slate-500">Max 4 MB (PDF/JPG/PNG for documents)</p>
  {!student&&<Select label="Status after upload" name="status" defaultValue="Uploaded"><option>Uploaded</option><option>Verified</option></Select>}
 </ActionForm>;
}
export function StudentDocuments({documents,allowUpload,studentId,student=false}:{documents:StudentDocument[];allowUpload:boolean;studentId?:string;student?:boolean}) {
 return <section className="space-y-5" aria-label={student?'My Documents':'Documents'}>
  <div><h2 className="section-title">{student?'My Documents':'Documents'}</h2><p className="mt-2 text-sm text-slate-500">{student?'Your document checklist and verification status.':'Manage this student’s checklist, files and verification.'}</p></div>
  {!student&&<>
   <ActionForm action={toggleStudentUploads} submit="Save upload permission" variant="outline">
    <input type="hidden" name="student_id" value={studentId}/>
    <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" name="allow_student_upload" defaultChecked={allowUpload}/>Allow Student to Upload Documents</label>
   </ActionForm>
   <details className="rounded-lg border border-slate-200 p-4"><summary className="font-semibold text-teal-800">Add checklist item</summary>
    <div className="mt-4 space-y-4"><ActionForm action={addDocument} submit="Add standard document" variant="outline"><input type="hidden" name="student_id" value={studentId}/><Select label="Standard document" name="document_name">{STANDARD_DOCUMENTS.map(name=><option key={name}>{name}</option>)}</Select></ActionForm>
    <ActionForm action={addDocument} submit="Add custom document" variant="outline"><input type="hidden" name="student_id" value={studentId}/><Field label="Custom document name" name="document_name" maxLength={150} required/></ActionForm></div>
   </details>
  </>}
  {!documents.length&&<p className="text-sm text-slate-500">Your centre has not added any document checklist items yet.</p>}
  <div className="grid gap-4 xl:grid-cols-2">{documents.map(doc=><article key={doc.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
   <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{doc.document_name}</h3><Badge>{doc.status}</Badge></div>
   {doc.file_name&&<p className="mt-3 break-words text-sm text-slate-500">{doc.file_name}</p>}
   {doc.remarks&&<p className="mt-3 whitespace-pre-line text-sm text-slate-600">{doc.remarks}</p>}
   {doc.has_file&&<div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline"><a href={`/documents/${doc.id}?as=${student?'student':'staff'}`} target="_blank" rel="noreferrer">View File</a></Button><Button asChild variant="outline"><a href={`/documents/${doc.id}?as=${student?'student':'staff'}&download=1`} target="_blank" rel="noreferrer">Download File</a></Button></div>}
   {!student&&<ActionForm key={`status-${doc.updated_at}`} action={updateDocument} submit="Update document status" variant="outline" className="mt-5">
    <input type="hidden" name="document_id" value={doc.id}/><input type="hidden" name="updated_at" value={doc.updated_at}/>
    <Select label={`Status for ${doc.document_name}`} name="status" defaultValue={doc.status}>{DOCUMENT_STATUSES.map(status=><option key={status}>{status}</option>)}</Select>
    <Field label={`Remark for ${doc.document_name}`} name="remarks" defaultValue={doc.remarks||''} maxLength={2000}/>
   </ActionForm>}
   {(!student || (allowUpload&&doc.status!=='Verified'))&&<details className="mt-4"><summary className="font-semibold text-teal-800">{doc.has_file?'Replace File':'Upload File'}</summary><FileUpload doc={doc} student={student}/></details>}
  </article>)}</div>
 </section>;
}
