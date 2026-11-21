'use client';
import {useState} from 'react';
import {ActionForm} from '@/components/action-form';
import {Field,Select} from '@/components/fields';
import {transferStudent} from '@/app/actions';
import type {Branch} from '@/components/staff-management';
export type TransferCandidate={id:string;branch_id:string;full_name:string;student_phone:string;registration_number:string|null};
export function StudentTransfer({students,branches}:{students:TransferCandidate[];branches:Branch[]}) {
 const [selected,setSelected]=useState('');
 const student=students.find(s=>s.id===selected);
 const destinations=branches.filter(b=>b.is_active&&b.id!==student?.branch_id);
 return <ActionForm action={async(state,form)=>{const result=await transferStudent(state,form);if(result.success)setSelected('');return result;}} submit="Transfer student" disabled={!student||!destinations.length}>
  <Select label="Student to transfer" name="id" value={selected} onChange={event=>setSelected(event.target.value)} required><option value="">Select a student</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name} · {s.registration_number||s.student_phone} · {branches.find(b=>b.id===s.branch_id)?.name||'Branch'}</option>)}</Select>
  {student&&<p className="text-sm text-slate-600">Current branch: <strong>{branches.find(b=>b.id===student.branch_id)?.name||'Branch'}</strong></p>}
  <Select key={`${selected}-${student?.branch_id}`} label="Destination branch" name="branch_id" defaultValue="" required disabled={!student}><option value="">Select a different branch</option>{destinations.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</Select>
  {student&&!destinations.length&&<p role="status" className="text-sm text-slate-500">Create or activate another branch before transferring this student.</p>}
  <Field label="Transfer reason" name="reason" placeholder="For example, student relocated to another city" maxLength={1000} required/>
  <p className="text-sm text-slate-500">The registration number stays the same. The previous counsellor assignment is cleared and the student must sign in again. Assign a counsellor in the destination branch after transfer.</p>
 </ActionForm>;
}
