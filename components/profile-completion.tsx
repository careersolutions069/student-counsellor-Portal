import { VisitConversion } from '@/components/visit-conversion';
import { RegistrationSection } from '@/components/registration-section';
import type { Student } from '@/components/student-records';
export function ProfileCompletion({student}: {student: Student}) {
  return <div className="space-y-5"><VisitConversion student={student}/><RegistrationSection student={student} origin={process.env.NEXT_PUBLIC_PORTAL_URL || ''}/></div>;
}
