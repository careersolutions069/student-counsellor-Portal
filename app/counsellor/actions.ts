"use server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { phoneSchema } from "@/lib/validation";
import {
  educationSchema,
  outcomeSchema,
  type CallLog,
  type CallerAppointment,
} from "@/lib/counsellor";
export type CallerResult = {
  error?: string;
  success?: string;
  parent_phone_shared?: boolean;
  student_name?: string;
  appointment?: CallerAppointment | null;
  call?: CallLog | null;
};
export async function checkParentPhone(
  form: FormData,
): Promise<{ warning?: string }> {
  const { client } = await requireStaff([
    "owner",
    "centre_head",
    "tele_counsellor",
  ]);
  const parsed = phoneSchema.safeParse(form.get("phone"));
  if (!parsed.success) return {};
  const target = z.uuid().safeParse(form.get("student_id"));
  const branch = z.uuid().safeParse(form.get("branch_id"));
  const { data, error } = await client.rpc("parent_phone_in_branch", {
    phone: parsed.data,
    target: target.success ? target.data : null,
    selected_branch: branch.success ? branch.data : null,
  });
  if (error)
    return {
      warning: "Parent number could not be checked. You can still save.",
    };
  return data
    ? {
        warning:
          "This parent number is already used in this branch. Siblings can still register.",
      }
    : {};
}
export async function recordCallerAction(
  _: CallerResult,
  form: FormData,
): Promise<CallerResult> {
  const { client } = await requireStaff(["tele_counsellor"]);
  try {
    const target = z.uuid().parse(form.get("student_id"));
    const education = educationSchema.parse(Object.fromEntries(form.entries()));
    const detailsOnly = form.get("intent") === "details";
    const outcome = detailsOnly
      ? null
      : outcomeSchema.parse(Object.fromEntries(form.entries()));
    const { data, error } = await client.rpc("record_counsellor_action", {
      target,
      education,
      action_type: outcome?.outcome || "details",
      request_id: detailsOnly ? null : z.uuid().parse(form.get("request_id")),
      visit_at: outcome?.outcome === "invite" ? outcome.scheduled_at : null,
      callback_at:
        outcome &&
        (outcome.outcome === "callback" || outcome.outcome === "no_answer")
          ? outcome.next_call_at
          : null,
      call_remarks: z
        .string()
        .max(3000)
        .parse(form.get("remarks") || ""),
      reason: outcome?.outcome === "dropped" ? outcome.drop_reason : null,
    });
    if (error) throw error;
    // Dynamic pages read fresh data; keep this drawer open until the invite is shared.
    return {
      ...data,
      success: detailsOnly
        ? "Education details saved."
        : outcome?.outcome === "invite"
          ? "Visit arranged. Send the invitation below."
          : outcome?.outcome === "dropped"
            ? "Lead marked as dropped."
            : "Callback saved. The lead will appear in To Call on its scheduled day.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0].message };
    return {
      error:
        "Unable to save. Check the required details and your student assignment, then try again.",
    };
  }
}
export async function callerHistory(
  studentId: string,
  cursor?: { created_at: string; id: string },
): Promise<{ calls: CallLog[]; hasMore: boolean; error?: string }> {
  const { client, staff } = await requireStaff(["tele_counsellor"]);
  try {
    z.uuid().parse(studentId);
    const { data: student } = await client
      .from("students")
      .select("id")
      .eq("id", studentId)
      .eq("branch_id", staff.branch_id!)
      .eq("assigned_to", staff.id)
      .single();
    if (!student) throw new Error("Access denied");
    let query = client
      .from("call_logs")
      .select("id,student_id,outcome,remarks,next_callback_at,created_at")
      .eq("student_id", studentId)
      .eq("branch_id", staff.branch_id!)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(25);
    if (cursor) {
      const value = z
        .object({ created_at: z.iso.datetime({ offset: true }), id: z.uuid() })
        .parse(cursor);
      query = query.or(
        `created_at.lt.${value.created_at},and(created_at.eq.${value.created_at},id.lt.${value.id})`,
      );
    }
    const { data, error } = await query;
    if (error) throw error;
    return { calls: data as CallLog[], hasMore: data.length === 25 };
  } catch {
    return { calls: [], hasMore: false, error: "Unable to load call history." };
  }
}
