import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { staffClient, adminClient, configured } from "@/lib/supabase/server";
import { STUDENT_COOKIE, verifyStudentSession } from "@/lib/session";
export type Role = "owner" | "centre_head" | "tele_counsellor";
export const destinations = {
  owner: "/owner",
  centre_head: "/branch",
  tele_counsellor: "/counsellor",
};
export type Staff = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  branch_id: string | null;
  is_active: boolean;
};
export async function requireStaff(roles: Role[]) {
  if (!configured()) redirect("/login");
  const client = await staffClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await client
    .from("staff_profiles")
    .select("*")
    .eq("id", user.id)
    .eq("is_active", true)
    .single();
  const staff = data as Staff | null;
  if (!staff)
    redirect(
      "/login?error=Your%20staff%20account%20is%20inactive%20or%20unavailable.",
    );
  if (!roles.includes(staff.role)) redirect(destinations[staff.role]);
  return { client, staff };
}
export type Portal = {
  id: string;
  full_name: string;
  registration_number: string;
  student_phone: string;
  dob: string;
  pipeline_stage: string;
  target_course: string | null;
  allow_student_upload: boolean;
  counselling_documents: import("@/lib/counselling").SharedCounsellingDocument[];
  documents: import("@/lib/student-documents").StudentDocument[];
  branch: { name: string; address: string; google_maps_url: string | null };
  appointments: { id: string; scheduled_at: string; status: string }[];
  shortlists: {
    id: string;
    college_name: string;
    course_name: string;
    fees_estimate: string | null;
    document_status: string | null;
    admission_status: string | null;
  }[];
};
export async function requireStudent(): Promise<Portal> {
  const session = await verifyStudentSession(
    (await cookies()).get(STUDENT_COOKIE)?.value,
  );
  if (!session) redirect("/login?tab=student");
  const { data, error } = await adminClient().rpc("student_portal", {
    target: session.studentId,
    session_hash: session.tokenHash,
  });
  if (error || !data) redirect("/login?tab=student");
  return data as Portal;
}
