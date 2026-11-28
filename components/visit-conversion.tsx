'use client';
import { useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useVisitDraft } from '@/components/use-visit-draft';
import { useUploadAction } from '@/components/use-upload-action';
import { FileRow } from '@/components/file-row';
import { Field } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { saveVisitDetails } from '@/app/visits/actions';
import { COURSES, selectedCourses } from '@/lib/visit-conversion';
import type { Student } from '@/components/student-records';
import type { ActionState } from '@/app/actions';
export function VisitConversion({student: s}: {student: Student}) {
  return <VisitEditor key={`${s.branch_id}-${s.id}`} student={s}/>;
}
function VisitEditor({student: s}: {student: Student}) {
  const draft = useVisitDraft(s.id, s.branch_id, s.student_visit_drafts);
  const initial = {...s, ...s.student_visit_drafts?.fields};
  const [collegeType, setCollegeType] = useState(initial.college_type || '');
  const [courses, setCourses] = useState(s.student_visit_drafts?.fields.selected_courses ?? selectedCourses(s.selected_courses, s.target_course));
  const file = useRef<HTMLInputElement>(null);
  const [pdfError, setPdfError] = useState('');
  const [saves, setSaves] = useState(0);
  const [state, action, pending, onSubmit] = useUploadAction<ActionState>(async (previous: ActionState, form: FormData) => {
    if (!await draft.flush()) return {error: 'Resolve the draft save before completing this visit.'};
    form.set('draft_version', draft.version.current ?? '');
    const result = await saveVisitDetails(previous, form);
    if (result.success) {
      if (result.version) draft.completed(result.version);
      if (file.current) file.current.value = '';
      setSaves(count => count + 1);
    }
    return result;
  }, {});
  const needsPdf = !s.college_pdf_path || collegeType !== s.college_type;
  return <section className="space-y-5 rounded-[14px] border border-line bg-white p-4 sm:p-5" aria-label="Visit & Conversion Form">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-lg font-bold text-navy">Visit &amp; Conversion Form</h3><span className="text-[13px] font-semibold text-muted">Step 1 · {s.visit_details_completed ? 'saved' : 'after the student attends'}</span></div>
    <p className="-mt-3 text-sm text-muted">Visit details save automatically as a draft. You can return with the college PDF later.</p>
    <form action={action} onChange={draft.change} onBlur={() => void draft.flush()} onSubmit={event => {
      // The file input is hidden behind the Upload button, so check the required PDF here.
      if (needsPdf && !file.current?.files?.length) {
        event.preventDefault();
        setPdfError(`Choose the ${collegeType === 'government' ? 'Government' : 'Private'} College PDF to complete the visit. You can leave once the draft is saved.`);
        return;
      }
      onSubmit(event);
    }} aria-busy={pending} onReset={event => event.preventDefault()} className="space-y-5">
      <input type="hidden" name="id" value={s.id}/>
      <input type="hidden" name="branch_id" value={s.branch_id}/>
      <input type="hidden" name="expected_pdf_path" value={s.college_pdf_path || ''}/>
      <input type="hidden" name="expected_college_type" value={s.college_type || ''}/>
      <p role="status" className="text-sm font-medium text-muted">{draft.status}</p>
      {draft.error && <div role="alert" className="text-sm text-danger-text">{draft.error} <Button type="button" size="sm" variant="outline" onClick={() => void draft.flush()}>Retry draft save</Button></div>}
      <fieldset disabled={pending} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Student name" name="full_name" defaultValue={initial.full_name} maxLength={150} required/>
          <Field label="Amount" name="counselling_amount" type="number" min="0.01" max="9999999999.99" step="0.01" defaultValue={initial.counselling_amount?.toString() || ''} required/>
          <Field label="F/N" name="F/N" defaultValue={initial['F/N'] || ''} maxLength={150} required/>
          <Field label="Phone / Mobile" name="student_phone" type="tel" defaultValue={initial.student_phone} required/>
          <Field label="City" name="city" defaultValue={initial.city || ''} maxLength={150} required/>
          <Field label="State" name="state" defaultValue={initial.state || ''} maxLength={150} required/>
          <Field label="Marks" name="percentage_or_score" defaultValue={initial.percentage_or_score || ''} maxLength={150} required/>
          <fieldset><legend className="mb-3 text-sm font-medium text-ink">Marks Type</legend><div className="flex flex-wrap gap-5">{[['exact','Exact'],['approximate','Approximate']].map(([value,label]) => <label key={value} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="marks_type" value={value} defaultChecked={value === (initial.marks_type || 'exact')} required/>{label}</label>)}</div></fieldset>
        </div>
        <fieldset><legend className="mb-2 text-sm font-medium text-ink">Courses · select one or more</legend><div className="flex flex-wrap gap-5">{COURSES.map((course,index) => <label key={course} className="flex min-h-11 items-center gap-2 font-medium"><input type="checkbox" name="selected_courses" value={course} checked={courses.includes(course)} required={index === 0 && !courses.length} onChange={event => setCourses(old => event.target.checked ? [...old, course] : old.filter(c => c !== course))}/>{course}</label>)}</div></fieldset>
        <fieldset><legend className="mb-2 text-sm font-medium text-ink">College Type</legend><div className="flex flex-wrap gap-5">{[['government','Government College'],['private','Private College']].map(([value,label]) => <label key={value} className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="radio" name="college_type" value={value} checked={collegeType === value} onChange={() => setCollegeType(value)} required/>{label}</label>)}</div></fieldset>
        {collegeType && <div className="rounded-xl border border-dashed border-[#9CC9C1] bg-[#F4FAF8] p-3.5">
          <FileRow key={`${collegeType}-${saves}`} inputRef={file} name="college_pdf" accept=".pdf,application/pdf" mode="select" busy={pending && Boolean(file.current?.files?.length)}
            label={`${collegeType === 'government' ? 'Government' : 'Private'} College PDF`}
            leading={<p className="font-semibold text-ink">{collegeType === 'government' ? 'Government' : 'Private'} College PDF <span className="font-normal text-muted">{needsPdf ? '· required' : '· optional'}</span></p>}
            hint={needsPdf ? 'PDF only · up to 4 MB. Saved when you select Save Visit Details.' : 'PDF only · up to 4 MB. The saved PDF is kept unless you upload a replacement.'}
            current={!needsPdf && s.college_pdf_name ? {name: s.college_pdf_name, href: `/college-registration/${s.id}`} : null}
            onFile={() => setPdfError('')} error={pdfError}/>
        </div>}
        <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true"/>}{pending ? 'Saving visit…' : 'Save Visit Details'}</Button>
      </fieldset>
      {state.error && <p role="alert" className="rounded-xl border border-[#F4C7C1] bg-danger-bg p-3 text-sm text-danger-text">{state.error}</p>}
      {state.success && <p role="status" className="rounded-xl bg-success-bg p-3 text-sm text-success">{state.success}</p>}
    </form>
    {s.college_pdf_path && <div className="space-y-3 border-t border-line pt-4"><p className="break-words text-sm font-medium">Saved {s.college_type === 'government' ? 'Government' : 'Private'} College PDF · {s.college_pdf_name}</p><div className="flex flex-wrap gap-2"><Button asChild variant="neutral" size="sm"><a href={`/college-registration/${s.id}`} target="_blank" rel="noreferrer">View College PDF</a></Button><Button asChild variant="neutral" size="sm"><a href={`/college-registration/${s.id}?download=1`} target="_blank" rel="noreferrer">Download College PDF</a></Button></div></div>}
  </section>;
}
