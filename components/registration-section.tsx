'use client';
import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Field } from '@/components/fields';
import { completeProfile } from '@/app/actions';
import { ShareStudentLogin } from '@/components/share-student-login';
import type { Student } from '@/components/student-records';
export function RegistrationSection({student: s, origin}: {student: Student; origin: string}) {
  const [dob, setDob] = useState(s.dob || '');
  return <section className="rounded-xl bg-[#FBF9F4] p-5" aria-label="Generate Registration ID">
    <h3 className="mb-3 text-lg font-semibold">{s.registration_number ? 'Registration & student login' : 'Generate Registration ID'}</h3>
    {!s.registration_number && <p className="mb-4 text-sm text-muted">{s.visit_details_completed ? 'Visit details are saved. Enter Date of Birth to generate the registration ID.' : 'Save all Visit Details and the college PDF before generating an ID.'}</p>}
    <ActionForm action={completeProfile} submit={s.registration_number ? 'Update Date of Birth' : 'Generate Registration ID'} disabled={!dob || (!s.registration_number && !s.visit_details_completed)}>
      <input type="hidden" name="id" value={s.id}/><input type="hidden" name="full_name" value={s.full_name}/><input type="hidden" name="student_phone" value={s.student_phone}/>
      <Field label="Date of birth" name="dob" type="date" value={dob} onChange={event => setDob(event.target.value)} max={new Date().toISOString().slice(0,10)} required/>
    </ActionForm>
    {s.registration_number && <ShareStudentLogin name={s.full_name} registration={s.registration_number} phone={s.student_phone} origin={origin}/>}
  </section>;
}
