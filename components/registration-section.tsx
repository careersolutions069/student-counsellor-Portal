'use client';
import { useId, useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Field } from '@/components/fields';
import { completeProfile } from '@/app/actions';
import { ShareStudentLogin } from '@/components/share-student-login';
import type { Student } from '@/components/student-records';
/** What is still missing before an ID can be generated, in the order staff fix it. */
export function registrationRequirement(visitSaved: boolean, dob: string) {
  if (!visitSaved && !dob) return 'Save visit details and add date of birth to generate an ID.';
  if (!visitSaved) return 'Save visit details (Step 1) to generate an ID.';
  if (!dob) return 'Add date of birth to generate an ID.';
  return 'Ready. Generating the ID creates the student’s portal login and can’t be undone.';
}
export function RegistrationSection({student: s, origin}: {student: Student; origin: string}) {
  const [dob, setDob] = useState(s.dob || '');
  const noteId = useId();
  const visitSaved = Boolean(s.visit_details_completed);
  return <section className="space-y-4 rounded-[14px] border border-line bg-white p-4 sm:p-5" aria-labelledby={`${noteId}-title`}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id={`${noteId}-title`} className="text-lg font-bold text-navy">Student login</h3>
      <span className="text-[13px] font-semibold text-muted">Step 2 · {s.registration_number ? 'ID generated' : 'once visit details are saved'}</span>
    </div>
    {s.registration_number ? <>
      <dl className="grid gap-3 rounded-xl bg-[#FBF9F4] p-4 sm:grid-cols-2">
        <div><dt className="text-[13px] text-muted">Registration no.</dt><dd className="font-mono text-base">{s.registration_number}</dd></div>
        <div><dt className="text-[13px] text-muted">Date of birth (password)</dt><dd className="num font-semibold">{s.dob ? new Intl.DateTimeFormat('en-IN', {day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'}).format(new Date(s.dob)) : '—'}</dd></div>
      </dl>
      <ShareStudentLogin name={s.full_name} registration={s.registration_number} phone={s.student_phone} origin={origin}/>
      <details className="text-sm">
        <summary className="min-h-11 py-2 font-semibold text-primary">Correct date of birth</summary>
        <ActionForm action={completeProfile} submit="Update Date of Birth" variant="outline" disabled={!dob} className="mt-2">
          <input type="hidden" name="id" value={s.id}/><input type="hidden" name="full_name" value={s.full_name}/><input type="hidden" name="student_phone" value={s.student_phone}/>
          <Field label="Date of birth" name="dob" type="date" value={dob} onChange={event => setDob(event.target.value)} max={new Date().toISOString().slice(0, 10)} required/>
        </ActionForm>
      </details>
    </> : <>
      <p className="text-sm text-[#3E4F59]">Generating a registration ID creates the student’s portal login (registration number + date of birth).</p>
      <ActionForm action={completeProfile} submit="Generate Registration ID" disabled={!dob || !visitSaved} note={registrationRequirement(visitSaved, dob)} noteId={noteId}>
        <input type="hidden" name="id" value={s.id}/><input type="hidden" name="full_name" value={s.full_name}/><input type="hidden" name="student_phone" value={s.student_phone}/>
        <Field label="Date of birth" name="dob" type="date" value={dob} onChange={event => setDob(event.target.value)} max={new Date().toISOString().slice(0, 10)} required/>
      </ActionForm>
    </>}
  </section>;
}
