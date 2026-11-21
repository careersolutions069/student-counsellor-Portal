'use server';
import {z} from 'zod';
import {requireStaff} from '@/lib/auth';
import {parseLeadFile,type ImportSummary} from '@/lib/lead-import';
import {MAX_UPLOAD_SIZE,UPLOAD_SIZE_ERROR} from '@/lib/upload-limits';
export type ImportResult={summary?:ImportSummary;error?:string};
export async function importLeads(_:ImportResult,form:FormData):Promise<ImportResult> {
 const {client,staff}=await requireStaff(['owner','centre_head']);
 try {
  const requested=z.uuid().parse(form.get('branch_id'));
  if(staff.role==='centre_head'&&requested!==staff.branch_id)throw Error('You can import only into your own branch.');
  const mode=z.enum(['round_robin','one','unassigned']).parse(form.get('assignment_mode'));
  const callers=z.array(z.uuid()).max(5000).parse(mode==='unassigned'?[]:mode==='one'?[form.get('one_caller')]:form.getAll('caller_ids'));
  const file=form.get('file');if(!(file instanceof File)||!file.size)throw Error('Choose a non-empty CSV or Excel file.');
  if(file.size>MAX_UPLOAD_SIZE)throw Error(UPLOAD_SIZE_ERROR);
  const parsed=parseLeadFile(new Uint8Array(await file.arrayBuffer()),file.name);
  const fileName=file.name.split(/[/\\]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180);
  const {data,error}=await client.rpc('bulk_import_leads',{target_branch:requested,file_name:fileName,lead_rows:parsed.rows,assignment_mode:mode,caller_ids:callers});
  if(error)throw Error('Import could not be confirmed. Refresh the student list before retrying. Check branch access and select active counsellors; existing student phones will be skipped on retry.');
  return {summary:data as ImportSummary};
 }catch(error){return {error:error instanceof z.ZodError?error.issues[0].message:error instanceof Error?error.message:'Unable to import leads.'};}
}
