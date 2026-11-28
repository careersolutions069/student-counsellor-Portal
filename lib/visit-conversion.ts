import { MAX_UPLOAD_SIZE, UPLOAD_SIZE_ERROR } from '@/lib/upload-limits';
import { z } from 'zod';
import { phoneSchema } from '@/lib/validation';
export const COURSES = ['MBBS', 'BDS', 'BAMS'] as const;
export const MAX_COLLEGE_PDF_SIZE = MAX_UPLOAD_SIZE;
export const visitSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter the student name.').max(150),
  'F/N': z.string().trim().min(1, 'Enter F/N.').max(150),
  student_phone: phoneSchema,
  city: z.string().trim().min(1, 'Enter the city.').max(150),
  state: z.string().trim().min(1, 'Enter the state.').max(150),
  counselling_amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a positive amount with up to two decimal places.').refine(value => Number(value) > 0 && Number(value) <= 9999999999.99, 'Enter an amount greater than zero and within 9,999,999,999.99.'),
  percentage_or_score: z.string().trim().min(1, 'Enter marks.').max(150),
  marks_type: z.enum(['exact', 'approximate']),
  selected_courses: z.array(z.enum(COURSES)).min(1, 'Select at least one course.').max(3).refine(value => new Set(value).size === value.length, 'Select each course only once.'),
  college_type: z.enum(['government', 'private']),
});
export type VisitDraftFields = Partial<Omit<z.input<typeof visitSchema>, "college_type" | "marks_type"> & {college_type: string; marks_type: string}>;
export type VisitDraft = {version: string; fields: VisitDraftFields};
export function selectedCourses(saved: string[] | undefined, target: string | null | undefined) {
  return saved?.length ? saved : [...new Set((target || '').toUpperCase().match(/\b(MBBS|BDS|BAMS)\b/g) || [])];
}
export function validateCollegePdf(file: {name: string; type: string; size: number}, bytes: Uint8Array) {
  if (!file.size) throw new Error('Choose a non-empty PDF.');
  if (file.size > MAX_COLLEGE_PDF_SIZE) throw new Error(UPLOAD_SIZE_ERROR);
  if (!file.name.toLowerCase().endsWith('.pdf') || file.type !== 'application/pdf' || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Choose a valid PDF file.');
}
