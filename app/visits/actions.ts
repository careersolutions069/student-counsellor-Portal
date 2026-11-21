'use server';
import { UPLOAD_SIZE_ERROR } from '@/lib/upload-limits';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/server';
import { DOCUMENT_BUCKET, definiteUploadRollback } from '@/lib/student-documents';
import { visitSchema, validateCollegePdf, MAX_COLLEGE_PDF_SIZE } from '@/lib/visit-conversion';
import type { Student } from '@/components/student-records';
import type { ActionState } from '@/app/actions';
export async function saveVisitDetails(_: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireStaff(['owner', 'centre_head']);
  const storage = adminClient().storage.from(DOCUMENT_BUCKET);
  let staged: string | undefined;
  let finalizing = false;
  let finalizationError: {code?: string} | null = null;
  try {
    const id = z.uuid().parse(form.get('id'));
    const details = visitSchema.parse({...Object.fromEntries(form), selected_courses: form.getAll('selected_courses')});
    const expectedBranch = z.uuid().parse(form.get('branch_id'));
    const expectedPath = z.string().parse(form.get('expected_pdf_path') || '') || null;
    const expectedType = z.enum(['', 'government', 'private']).parse(form.get('expected_college_type') || '') || null;
    const { data, error } = await client.rpc('managed_students').eq('id', id).single();
    if (error || !data) throw new Error('Student unavailable. Refresh and check your access.');
    const student = data as Student;
    if (student.branch_id !== expectedBranch || student.college_pdf_path !== expectedPath || student.college_type !== expectedType) throw new Error('Visit changed. Refresh before saving.');
    const file = form.get('college_pdf');
    let filename: string | null = null;
    if (file instanceof File && file.name) {
      if (!file.size) throw new Error('Choose a non-empty PDF.');
      if (file.size > MAX_COLLEGE_PDF_SIZE) throw new Error(UPLOAD_SIZE_ERROR);
      const bytes = new Uint8Array(await file.arrayBuffer());
      validateCollegePdf(file, bytes);
      filename = file.name.split(/[/\\]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180);
      staged = `${student.branch_id}/${student.id}/college-registration/${randomUUID()}.pdf`;
      const uploaded = await storage.upload(staged, bytes, {contentType: 'application/pdf', upsert: false, cacheControl: '0'});
      if (uploaded.error) throw new Error('PDF upload failed. Please try again.');
    } else if (!student.college_pdf_path || details.college_type !== student.college_type) {
      throw new Error('Upload a new PDF for the selected college type.');
    }
    finalizing = true;
    const result = await client.rpc('save_visit_details', {
      target: id, details, expected_branch: expectedBranch, expected_pdf_path: expectedPath,
      expected_college_type: expectedType, new_pdf_path: staged || null, new_pdf_name: filename,
    });
    if (result.error) {
      finalizationError = result.error;
      throw new Error('Unable to confirm the save. Refresh to check the visit and your access before retrying.');
    }
    staged = undefined;
    if (result.data) {
      const removed = await storage.remove([result.data]);
      if (removed.error) console.error('Old college PDF cleanup failed', id);
    }
    for (const path of ['/branch', '/owner', '/counsellor', '/student']) revalidatePath(path);
    return {success: 'Visit details saved. Registration can be generated separately after entering DOB.'};
  } catch (error) {
    // Preserve possibly committed files on unknown transport failures; reconcile orphan objects during maintenance.
    if (staged && (!finalizing || definiteUploadRollback(finalizationError))) {
      const removed = await storage.remove([staged]);
      if (removed.error) console.error('Staged college PDF cleanup failed');
    }
    return {error: error instanceof z.ZodError ? error.issues[0].message : error instanceof Error ? error.message : 'Unable to save visit details.'};
  }
}
