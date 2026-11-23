import { MAX_UPLOAD_SIZE, UPLOAD_SIZE_ERROR } from '@/lib/upload-limits';
import type { AdmissionStatus } from '@/lib/admission-status';
export const DOCUMENT_BUCKET = 'student-documents';
export const MAX_DOCUMENT_SIZE = MAX_UPLOAD_SIZE;
export const DOCUMENT_STATUSES = ['Pending','Uploaded','Verified','Re-upload Needed'] as const;
export const STANDARD_DOCUMENTS = ['10th Marksheet','12th Marksheet','Aadhar / ID Proof','TC / Migration Certificate','Passport Photo'];
export type StudentDocument = {
 id:string; student_id?:string; document_name:string; status:typeof DOCUMENT_STATUSES[number];
 file_name:string|null; has_file:boolean; remarks:string|null; updated_at:string;
};
export function validateDocumentFile(file:{name:string;type:string;size:number},bytes:Uint8Array) {
 if(!file.size) throw new Error('Choose a non-empty file.');
 if(file.size>MAX_DOCUMENT_SIZE) throw new Error(UPLOAD_SIZE_ERROR);
 const extension=file.name.split('.').at(-1)?.toLowerCase();
 const pdf=extension==='pdf' && file.type==='application/pdf' && new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
 const jpg=['jpg','jpeg'].includes(extension||'') && file.type==='image/jpeg' && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
 const png=extension==='png' && file.type==='image/png' && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 if(!pdf&&!jpg&&!png) throw new Error('Choose a valid PDF, JPG, JPEG or PNG file.');
 return {extension:extension!,mime:pdf?'application/pdf':jpg?'image/jpeg':'image/png'};
}
export function loginMessage(name:string,registration:string,origin:string) {
 return `Career Solution — Student Portal Login\n\nStudent Name: ${name}\nRegistration Number: ${registration}\nPortal Login URL: ${new URL('/login',origin).href}\n\nSelect Student login and sign in using your Registration Number and Date of Birth.`;
}
export const ADMISSION_STEPS=['Registered','Colleges Shortlisted','Documents Verified','Applied','Admission Confirmed'];
export function admissionStep(stage:string,shortlists:{admission_status:string|null}[],documents:{status:string}[]) {
 // Only canonical statuses count. Legacy or unknown text never advances the tracker.
 const has=(status:AdmissionStatus)=>shortlists.some(c=>c.admission_status===status);
 if(stage==='Admitted'||has('Admission Confirmed')) return 4;
 if(stage==='Applied'||has('Applied')) return 3;
 if(documents.length && documents.every(d=>d.status==='Verified')) return 2;
 return shortlists.length?1:0;
}

export function definiteUploadRollback(error: {code?:string}|null) {
 return Boolean(error?.code && /^(P0001|23[0-9A-Z]{3}|42501|40P01|40001)$/.test(error.code));
}
