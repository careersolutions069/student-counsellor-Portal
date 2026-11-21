"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminClient, configured, staffClient } from "@/lib/supabase/server";
import { destinations, requireStaff, type Role } from "@/lib/auth";
import {
  hash,
  newSessionToken,
  signStudentSession,
  STUDENT_COOKIE,
  verifyStudentSession,
} from "@/lib/session";
import { phoneSchema, registrationSchema } from "@/lib/validation";
export type ActionState = { error?: string; success?: string };
const uuid = z.uuid();
const phone = phoneSchema;
const name = z.string().trim().min(1).max(150);
const dob = z.iso
  .date()
  .refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    "DOB must be today or earlier.",
  );
function fields(form: FormData) {
  return Object.fromEntries(form.entries());
}
function failure(error: unknown): ActionState {
  if (error instanceof z.ZodError) return { error: error.issues[0].message };
  console.error(
    "Portal action failed",
    error instanceof Error ? error.message : "Database operation failed",
  );
  return {
    error:
      "Unable to save. Check the values and your access, then try again. Student phone numbers and branch codes must be unique.",
  };
}
export async function staffLogin(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!configured())
    return { error: "Configure Supabase in .env.local to enable login." };
  const parsed = z
    .object({ email: z.email(), password: z.string().min(1) })
    .safeParse(fields(form));
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const client = await staffClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email or password is incorrect." };
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: "Sign-in could not be verified. Try again." };
  const { data: profile } = await client
    .from("staff_profiles")
    .select("role,is_active")
    .eq("id", user!.id)
    .eq("is_active", true)
    .single();
  if (!profile) {
    await client.auth.signOut();
    return {
      error:
        "Your staff account is inactive or unavailable. Contact the owner.",
    };
  }
  (await cookies()).delete(STUDENT_COOKIE);
  redirect(destinations[profile.role as Role]);
}
export async function studentLogin(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!configured())
    return { error: "Configure Supabase in .env.local to enable login." };
  const parsedReg = registrationSchema.safeParse(form.get("registration_number"));
  if (!parsedReg.success) return { error: "Enter a valid registration number." };
  const reg = parsedReg.data;
  const birth = z.iso.date().safeParse(form.get("dob"));
  const requestHeaders = await headers();
  const ipHeader = process.env.TRUSTED_IP_HEADER;
  const ip = ipHeader
    ? requestHeaders.get(ipHeader) || "unknown"
    : "unconfigured";
  const token = newSessionToken();
  let studentId: string;
  try {
    // Sign first so configuration failures cannot leave a successful unusable login.
    await signStudentSession("configuration-check", token);
    const { data, error } = await adminClient().rpc("student_login", {
      reg,
      birth_date: birth.success ? birth.data : null,
      ip_hash: hash(ip),
      session_hash: hash(token),
    });
    if (error) throw error;
    if (data.error) return { error: data.error };
    studentId = data.student_id;
    (await cookies()).set(
      STUDENT_COOKIE,
      await signStudentSession(studentId, token),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 8 * 60 * 60,
      },
    );
  } catch {
    return { error: "Student login is unavailable. Contact your centre." };
  }
  redirect("/student");
}
export async function logout() {
  const store = await cookies();
  const session = await verifyStudentSession(store.get(STUDENT_COOKIE)?.value);
  if (session)
    await adminClient().rpc("student_logout", {
      session_hash: session.tokenHash,
    });
  store.delete(STUDENT_COOKIE);
  if (configured()) await (await staffClient()).auth.signOut();
  redirect("/login");
}
export async function createBranch(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireStaff(["owner"]);
  try {
    const value = z
      .object({
        name,
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{3}$/, "Use a three-letter branch code."),
        city: name,
        address: z.string().trim().min(5).max(500),
        google_maps_url: z
          .url()
          .regex(
            /^https:\/\/(www\.)?(google\.com\/maps|maps\.google\.com|maps\.app\.goo\.gl)(\/|\?|$)/,
          ),
      })
      .parse(fields(form));
    const { error } = await client.from("branches").insert(value);
    if (error) throw error;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/owner");
  return { success: "Branch created." };
}
export async function createStaff(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client, staff } = await requireStaff(["owner", "centre_head"]);
  try {
    const value = z
      .object({
        full_name: name,
        email: z.email(),
        password: z.string().min(12).max(128),
        role: z.enum(["centre_head", "tele_counsellor"]),
        branch_id: uuid,
      })
      .parse(fields(form));
    if (
      staff.role === "centre_head" &&
      (value.branch_id !== staff.branch_id || value.role !== "tele_counsellor")
    )
      return {
        error:
          "Centre Heads can only create Tele-counsellors in their own branch.",
      };
    const { data: branch } = await client
      .from("branches")
      .select("id")
      .eq("id", value.branch_id)
      .eq("is_active", true)
      .single();
    if (!branch) return { error: "Select an active branch." };
    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: value.email,
      password: value.password,
      email_confirm: true,
    });
    if (error) throw error;
    const { error: profileError } = await client.from("staff_profiles").insert({
      id: data.user.id,
      full_name: value.full_name,
      email: value.email,
      role: value.role,
      branch_id: value.branch_id,
    });
    if (profileError) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(
        data.user.id,
      );
      if (cleanupError)
        console.error("Auth account cleanup required", data.user.id);
      throw profileError;
    }
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/owner");
  revalidatePath("/branch");
  return {
    success: "Staff account created. Share the temporary password securely.",
  };
}
export async function toggleStaff(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client, staff } = await requireStaff(["owner", "centre_head"]);
  try {
    const value = z
      .object({ id: uuid, active: z.enum(["true", "false"]) })
      .parse(fields(form));
    let query = client
      .from("staff_profiles")
      .update({ is_active: value.active === "true" })
      .eq("id", value.id)
      .neq("role", "owner");
    if (staff.role === "centre_head")
      query = query
        .eq("branch_id", staff.branch_id!)
        .eq("role", "tele_counsellor");
    const { data, error } = await query.select("id");
    if (error || !data?.length) throw error || new Error("Access denied");
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/owner");
  revalidatePath("/branch");
  return { success: "Staff access updated." };
}
export async function saveStudent(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client, staff } = await requireStaff([
    "owner",
    "centre_head",
    "tele_counsellor",
  ]);
  try {
    const value = z
      .object({
        full_name: name,
        student_phone: phone,
        parent_phone: z.union([z.literal(""), phone]),
        target_course: z.string().max(300).optional(),
        academic_stream: z.string().max(150).optional(),
        percentage_or_score: z.string().max(150).optional(),
        preferred_locations: z.string().max(500).optional(),
        budget_range: z.string().max(150).optional(),
        drop_reason: z.string().max(1000).optional(),
        lead_source: z.string().max(150),
        pipeline_stage: z.enum([
          "New Enquiry",
          "Contacted",
          "Meeting Scheduled",
          "F2F Scheduled",
          "F2F Missed",
          "Dropped",
          "Counselling",
          "Applied",
          "Admitted",
          "Closed",
        ]),
        assigned_to: uuid.or(z.literal("")),
      })
      .parse(fields(form));
    const id = form.get("id");
    const student = {
      ...value,
      parent_phone: value.parent_phone || null,
      assigned_to: value.assigned_to || null,
    };
    if (id) {
      uuid.parse(id);
      let query = client.from("students").update(student).eq("id", id);
      if (staff.role !== "owner")
        query = query.eq("branch_id", staff.branch_id!);
      const { data, error } = await query.select("id");
      if (error || !data?.length) throw error || new Error("Access denied");
    } else {
      if (staff.role === "tele_counsellor")
        return { error: "Only a Centre Head or owner can add enquiries." };
      const branchId =
        staff.role === "owner"
          ? uuid.parse(form.get("branch_id"))
          : staff.branch_id;
      const { error } = await client
        .from("students")
        .insert({ ...student, branch_id: branchId });
      if (error) throw error;
    }
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/branch");
  revalidatePath("/owner");
  revalidatePath("/counsellor");
  return { success: "Student saved." };
}
export async function completeProfile(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireStaff(["owner", "centre_head"]);
  try {
    const value = z
      .object({ id: uuid, full_name: name, student_phone: phone, dob })
      .parse(fields(form));
    const { data, error } = await client.rpc("complete_student_profile", {
      target: value.id,
      student_name: value.full_name,
      phone: value.student_phone,
      birth_date: value.dob,
    });
    if (error) throw error;
    revalidatePath("/branch");
    revalidatePath("/owner");
    return { success: `Profile complete. Registration ID ${data}` };
  } catch (error) {
    return failure(error);
  }
}
export async function transferStudent(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireStaff(["owner"]);
  try {
    const target = uuid.parse(form.get("id"));
    const destination = uuid.parse(form.get("branch_id"));
    const { error } = await client.rpc("transfer_student", {
      target,
      destination,
      transfer_reason: z
        .string()
        .trim()
        .min(1, "Enter a transfer reason.")
        .max(1000)
        .parse(form.get("reason")),
    });
    if (error) throw error;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/owner");
  revalidatePath("/branch");
  revalidatePath("/counsellor");
  revalidatePath("/student");
  return {
    success:
      "Student transferred. Reassign a counsellor in the destination branch.",
  };
}
export async function addStudentActivity(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client, staff } = await requireStaff([
    "owner",
    "centre_head",
    "tele_counsellor",
  ]);
  try {
    const id = uuid.parse(form.get("student_id"));
    let studentQuery = client.from("students").select("branch_id").eq("id", id);
    if (staff.role !== "owner")
      studentQuery = studentQuery.eq("branch_id", staff.branch_id!);
    const { data: student } = await studentQuery.single();
    if (!student) return { error: "Student unavailable." };
    const base = { student_id: id, branch_id: student.branch_id };
    const kind = form.get("kind");
    if (kind === "call") {
      const value = z
        .object({
          outcome: name,
          remarks: z.string().max(3000),
          next_callback_at: z.iso.datetime({ offset: true }).or(z.literal("")),
        })
        .parse(fields(form));
      const { error } = await client.from("call_logs").insert({
        ...base,
        ...value,
        next_callback_at: value.next_callback_at || null,
        logged_by: staff.id,
      });
      if (error) throw error;
    } else if (kind === "appointment") {
      const scheduled = z.iso
        .datetime({ offset: true })
        .parse(form.get("scheduled_at"));
      const { error } = await client
        .from("appointments")
        .insert({ ...base, scheduled_at: scheduled, created_by: staff.id });
      if (error) throw error;
    } else if (kind === "shortlist") {
      const value = z
        .object({
          college_name: name,
          course_name: name,
          fees_estimate: z.string().max(150),
          document_status: z.string().max(2000),
          admission_status: z.string().max(150),
        })
        .parse(fields(form));
      const { error } = await client.from("shortlists_and_admissions").insert({
        ...base,
        ...value,
        is_shared: form.get("is_shared") === "on",
      });
      if (error) throw error;
    } else return { error: "Unknown activity." };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/branch");
  revalidatePath("/owner");
  revalidatePath("/counsellor");
  revalidatePath("/student");
  return { success: "Activity saved." };
}

export async function updateActivity(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client, staff } = await requireStaff([
    "owner",
    "centre_head",
    "tele_counsellor",
  ]);
  try {
    const id = uuid.parse(form.get("id"));
    const studentId = uuid.parse(form.get("student_id"));
    if (form.get("kind") === "appointment") {
      const value = z
        .object({
          scheduled_at: z.iso.datetime({ offset: true }),
          status: z.enum([
            "scheduled",
            "attended",
            "completed",
            "cancelled",
            "missed",
          ]),
        })
        .parse(fields(form));
      let query = client
        .from("appointments")
        .update(value)
        .eq("id", id)
        .eq("student_id", studentId);
      if (staff.role !== "owner")
        query = query.eq("branch_id", staff.branch_id!);
      const { data, error } = await query.select("id");
      if (error || !data?.length) throw error || new Error("Access denied");
    } else if (form.get("kind") === "shortlist") {
      const value = z
        .object({
          college_name: name,
          course_name: name,
          fees_estimate: z.string().max(150),
          document_status: z.string().max(2000),
          admission_status: z.string().max(150),
        })
        .parse(fields(form));
      let query = client
        .from("shortlists_and_admissions")
        .update({ ...value, is_shared: form.get("is_shared") === "on" })
        .eq("id", id)
        .eq("student_id", studentId);
      if (staff.role !== "owner")
        query = query.eq("branch_id", staff.branch_id!);
      const { data, error } = await query.select("id");
      if (error || !data?.length) throw error || new Error("Access denied");
    } else return { error: "Unknown activity." };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/owner");
  revalidatePath("/branch");
  revalidatePath("/counsellor");
  revalidatePath("/student");
  return { success: "Activity updated." };
}

export async function updateBranch(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireStaff(["owner"]);
  try {
    const value = z
      .object({
        id: uuid,
        name,
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{3}$/),
        city: name,
        address: z.string().trim().min(5).max(500),
        google_maps_url: z
          .url()
          .regex(
            /^https:\/\/(www\.)?(google\.com\/maps|maps\.google\.com|maps\.app\.goo\.gl)(\/|\?|$)/,
          ),
        is_active: z.enum(["true", "false"]),
      })
      .parse(fields(form));
    const { id, ...details } = value;
    const { data, error } = await client
      .from("branches")
      .update({ ...details, is_active: value.is_active === "true" })
      .eq("id", id)
      .select("id");
    if (error || !data?.length) throw error || new Error("Branch unavailable");
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/owner");
  revalidatePath("/branch");
  revalidatePath("/student");
  return { success: "Branch updated." };
}
export async function editStaff(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client, staff } = await requireStaff(["owner", "centre_head"]);
  try {
    const value = z
      .object({
        id: uuid,
        full_name: name,
        role: z.enum(["centre_head", "tele_counsellor"]),
        branch_id: uuid,
      })
      .parse(fields(form));
    if (
      staff.role === "centre_head" &&
      (value.role !== "tele_counsellor" || value.branch_id !== staff.branch_id)
    )
      return { error: "Only your branch’s tele-counsellors can be edited." };
    const { error } = await client.rpc("update_staff", {
      target: value.id,
      staff_name: value.full_name,
      staff_role: value.role,
      destination: value.branch_id,
    });
    if (error) throw error;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/owner");
  revalidatePath("/branch");
  revalidatePath("/counsellor");
  return { success: "Staff profile updated." };
}
export async function markAppointment(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client, staff } = await requireStaff(["owner", "centre_head"]);
  try {
    const value = z
      .object({ id: uuid, status: z.enum(["attended", "missed"]) })
      .parse(fields(form));
    let query = client
      .from("appointments")
      .update({ status: value.status })
      .eq("id", value.id)
      .in("status", ["scheduled", "attended", "completed", "missed"]);
    if (staff.role === "centre_head")
      query = query.eq("branch_id", staff.branch_id!);
    const { data, error } = await query.select("id");
    if (error || !data?.length)
      throw error || new Error("Appointment unavailable");
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/owner");
  revalidatePath("/branch");
  revalidatePath("/student");
  return { success: "Attendance updated." };
}
export async function deleteShortlist(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client, staff } = await requireStaff(["owner", "centre_head"]);
  try {
    const id = uuid.parse(form.get("id"));
    let query = client.from("shortlists_and_admissions").delete().eq("id", id);
    if (staff.role === "centre_head")
      query = query.eq("branch_id", staff.branch_id!);
    const { data, error } = await query.select("id");
    if (error || !data?.length)
      throw error || new Error("Shortlist unavailable");
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/owner");
  revalidatePath("/branch");
  revalidatePath("/student");
  return { success: "Shortlist entry deleted." };
}
