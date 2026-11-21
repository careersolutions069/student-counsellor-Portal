import 'server-only';
import { cookies } from 'next/headers';
import { requireStaff } from '@/lib/auth';
import { STUDENT_COOKIE,verifyStudentSession } from '@/lib/session';
import { adminClient } from '@/lib/supabase/server';
export async function documentActor(student:boolean) {
 if(!student) {
  const {staff}=await requireStaff(['owner','centre_head']);
  return {staff_actor:staff.id,target_student:null,session_hash:null};
 }
 const session=await verifyStudentSession((await cookies()).get(STUDENT_COOKIE)?.value);
 if(!session) throw new Error('Your session has expired. Sign in again.');
 return {staff_actor:null,target_student:session.studentId,session_hash:session.tokenHash};
}
export async function accessDocument(id:string,actor:Awaited<ReturnType<typeof documentActor>>,upload=false) {
 const {data,error}=await adminClient().rpc('document_access',{document_id:id,...actor,for_upload:upload});
 if(error||!data) throw new Error('Document unavailable or permission has changed. Refresh and try again.');
 return data as {id:string;student_id:string;file_path:string|null;file_name:string|null;updated_at:string};
}
