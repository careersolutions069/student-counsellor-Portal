'use client';
import { ActionForm } from '@/components/action-form';
import { FileRow } from '@/components/file-row';
import { uploadStaffDocument,uploadStudentDocument } from '@/app/documents/actions';
import type { StudentDocument } from '@/lib/student-documents';
const DOCUMENT_ACCEPT='.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
/** One upload row per checklist item: choosing a file with Upload submits it straight away. */
export function DocumentUpload({doc,student,leading,trailing,children}:{doc:StudentDocument;student:boolean;leading:React.ReactNode;trailing?:React.ReactNode;children?:React.ReactNode}) {
 return <ActionForm key={doc.id} action={student?uploadStudentDocument:uploadStaffDocument} submit="Upload" hideSubmit className="space-y-2">
  {pending=><>
   <input type="hidden" name="document_id" value={doc.id}/><input type="hidden" name="updated_at" value={doc.updated_at}/>
   <FileRow label={doc.document_name} name="file" accept={DOCUMENT_ACCEPT} hint="PDF, JPG or PNG · up to 4 MB" mode="submit" busy={pending}
    current={doc.has_file?{name:doc.file_name||'Uploaded file',href:`/documents/${doc.id}?as=${student?'student':'staff'}`}:null}
    leading={leading} trailing={trailing}/>
   {children}
  </>}
 </ActionForm>;
}
