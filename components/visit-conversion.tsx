'use client';
import { useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useUploadAction } from '@/components/use-upload-action';
import { UploadField } from '@/components/upload-field';
import { Field } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { saveVisitDetails } from '@/app/visits/actions';
import { COURSES, selectedCourses } from '@/lib/visit-conversion';
import type { Student } from '@/components/student-records';
import type { ActionState } from '@/app/actions';
export function VisitConversion({student: s}: {student: Student}) {
  const [collegeType, setCollegeType] = useState(s.college_type || '');
  const [courses, setCourses] = useState(selectedCourses(s.selected_courses, s.target_course));
  const file = useRef<HTMLInputElement>(null);
  const [state, action, pending, onSubmit] = useUploadAction<ActionState>(async (previous: ActionState, form: FormData) => {
    const result = await saveVisitDetails(previous, form);
    if (result.success && file.current) file.current.value = '';
    return result;
  }, {});
  const needsPdf = !s.college_pdf_path || collegeType !== s.college_type;
  return <section className="space-y-5 rounded-xl border border-line bg-white p-5" aria-label="Visit & Conversion Form">
    <div><h3 className="text-lg font-semibold">Visit & Conversion Form</h3><p className="mt-2 text-sm text-muted">Capture the counselling visit and the selected college document.</p></div>
    <form action={action} onSubmit={onSubmit} aria-busy={pending} onReset={event => event.preventDefault()} className="space-y-5">
      <input type="hidden" name="id" value={s.id}/>
      <input type="hidden" name="branch_id" value={s.branch_id}/>
      <input type="hidden" name="expected_pdf_path" value={s.college_pdf_path || ''}/>
      <input type="hidden" name="expected_college_type" value={s.college_type || ''}/>
      <fieldset disabled={pending} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Student name" name="full_name" defaultValue={s.full_name} maxLength={150} required/>
          <Field label="Amount" name="counselling_amount" type="number" min="0.01" max="9999999999.99" step="0.01" defaultValue={s.counselling_amount?.toString() || ''} required/>
          <Field label="F/N" name="F/N" defaultValue={s['F/N'] || ''} maxLength={150} required/>
          <Field label="Phone / Mobile" name="student_phone" type="tel" defaultValue={s.student_phone} required/>
          <Field label="City" name="city" defaultValue={s.city || ''} maxLength={150} required/>
          <Field label="State" name="state" defaultValue={s.state || ''} maxLength={150} required/>
          <Field label="Marks" name="percentage_or_score" defaultValue={s.percentage_or_score || ''} maxLength={150} required/>
          <fieldset><legend className="mb-3 text-sm font-medium text-ink">Marks Type</legend><div className="flex flex-wrap gap-5">{[['exact','Exact'],['approximate','Approximate']].map(([value,label]) => <label key={value} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="marks_type" value={value} defaultChecked={value === (s.marks_type || 'exact')} required/>{label}</label>)}</div></fieldset>
        </div>
        <fieldset><legend className="mb-2 text-sm font-medium text-ink">Courses · select one or more</legend><div className="flex flex-wrap gap-5">{COURSES.map((course,index) => <label key={course} className="flex min-h-11 items-center gap-2 font-medium"><input type="checkbox" name="selected_courses" value={course} checked={courses.includes(course)} required={index === 0 && !courses.length} onChange={event => setCourses(old => event.target.checked ? [...old, course] : old.filter(c => c !== course))}/>{course}</label>)}</div></fieldset>
        <fieldset><legend className="mb-2 text-sm font-medium text-ink">College Type</legend><div className="flex flex-wrap gap-5">{[['government','Government College'],['private','Private College']].map(([value,label]) => <label key={value} className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="radio" name="college_type" value={value} checked={collegeType === value} onChange={() => setCollegeType(value)} required/>{label}</label>)}</div></fieldset>
        {collegeType && <div className="rounded-xl border border-dashed border-[#9CC9C1] bg-teal-soft p-4">
          <UploadField ref={file} label={`Upload ${collegeType === 'government' ? 'Government' : 'Private'} College PDF (Required)`} name="college_pdf" type="file" accept=".pdf,application/pdf" required={needsPdf}/>
          <p className="mt-3 text-sm text-[#3E4F59]">Max 4 MB (PDF only for college registration). {needsPdf ? 'Choose a PDF before saving.' : 'The saved PDF will be kept unless you choose a replacement.'}</p>
        </div>}
        <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true"/>}{pending ? 'Saving visit…' : 'Save Visit Details'}</Button>
      </fieldset>
      {state.error && <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger-text">{state.error}</p>}
      {state.success && <p role="status" className="rounded-lg bg-teal-soft p-3 text-sm text-navy">{state.success}</p>}
    </form>
    {s.college_pdf_path && <div className="space-y-3 border-t border-line pt-4"><p className="break-words text-sm font-medium">Saved {s.college_type === 'government' ? 'Government' : 'Private'} College PDF · {s.college_pdf_name}</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a href={`/college-registration/${s.id}`} target="_blank" rel="noreferrer">View College PDF</a></Button><Button asChild variant="outline"><a href={`/college-registration/${s.id}?download=1`} target="_blank" rel="noreferrer">Download College PDF</a></Button></div></div>}
  </section>;
}
