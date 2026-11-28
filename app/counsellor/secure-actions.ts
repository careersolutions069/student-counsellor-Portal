"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { callProvider, type CallEvent } from "@/lib/calling/provider";
import { applyCallEvents } from "@/lib/calling/events";
import { secureDetailsSchema, secureOutcomeSchema, type DeskAttempt } from "@/lib/secure-calling";

// Messages raised by the database that are safe and useful to show the caller.
const SHOWN = [
  "Finish your current call first.",
  "This student is not your current lead.",
  "This student is not available for calling.",
  "No parent number is saved for this student.",
  "Call the student before saving an outcome.",
  "This visit is no longer scheduled.",
  "This invite was already sent.",
  "Next callback date and time required",
  "Visit date and time required",
  "Drop reason required",
];
function shown(message: string | undefined, fallback: string) {
  if (message?.startsWith("Ask your Centre Head")) return message;
  return SHOWN.find((text) => message === text) || fallback;
}
const NOT_CONNECTED = "Company calling is not connected for this branch yet. Ask your Centre Head.";

export async function startCall(studentId: string, contact: "student" | "parent"): Promise<{ attempt?: DeskAttempt; error?: string }> {
  const { client } = await requireStaff(["tele_counsellor"]);
  const provider = callProvider();
  if (!provider) return { error: NOT_CONNECTED };
  const target = z.uuid().safeParse(studentId);
  const who = z.enum(["student", "parent"]).safeParse(contact);
  if (!target.success || !who.success) return { error: "Choose who to call." };
  const { data: attemptId, error } = await client.rpc("begin_call_attempt", { target: target.data, contact_type: who.data, provider_name: provider.name });
  if (error || typeof attemptId !== "string") return { error: shown(error?.message, "The call could not be started. Try again.") };
  // Only the server sees the number, and only to hand it to the provider.
  const admin = adminClient();
  try {
    const { data: numbers, error: contactError } = await admin.rpc("call_contact", { attempt: attemptId });
    if (contactError || !numbers) throw new Error("unavailable");
    const placed = await provider.placeCall({ attemptId, agentPhone: numbers.agent, customerPhone: numbers.customer });
    const { error: startedError } = await admin.rpc("record_call_started", { attempt: attemptId, provider_call: placed.providerCallId });
    if (startedError) throw new Error("unrecorded");
    if (placed.events?.length) await applyCallEvents(provider.name, placed.events);
  } catch {
    await admin.rpc("record_call_failed", { attempt: attemptId });
  }
  return attemptStatus(attemptId);
}

export async function attemptStatus(attemptId: string): Promise<{ attempt?: DeskAttempt; error?: string }> {
  const { client } = await requireStaff(["tele_counsellor"]);
  const id = z.uuid().safeParse(attemptId);
  if (!id.success) return { error: "Call not found." };
  const { data, error } = await client.from("call_attempts").select("id,contact,status,talk_seconds").eq("id", id.data).maybeSingle();
  if (error || !data) return { error: "Call status is unavailable. Refresh the page." };
  return { attempt: data as DeskAttempt };
}

/** Local test provider only: plays back what a real provider would report. */
export async function simulateCall(attemptId: string, result: "answered" | "busy" | "no_answer"): Promise<{ attempt?: DeskAttempt; error?: string }> {
  const { client } = await requireStaff(["tele_counsellor"]);
  const provider = callProvider();
  if (!provider?.test) return { error: "Test calls are not available." };
  const id = z.uuid().safeParse(attemptId);
  const kind = z.enum(["answered", "busy", "no_answer"]).safeParse(result);
  if (!id.success || !kind.success) return { error: "Call not found." };
  const { data } = await client.from("call_attempts").select("provider_call_id").eq("id", id.data).maybeSingle();
  if (!data?.provider_call_id) return { error: "Call not found." };
  const call = data.provider_call_id as string;
  const events: CallEvent[] =
    kind.data === "answered"
      ? [
          { eventId: randomUUID(), providerCallId: call, status: "answered" },
          { eventId: randomUUID(), providerCallId: call, status: "completed", talkSeconds: 95 },
        ]
      : [{ eventId: randomUUID(), providerCallId: call, status: kind.data }];
  try {
    await applyCallEvents(provider.name, events);
  } catch {
    return { error: "Test result could not be recorded." };
  }
  return attemptStatus(id.data);
}

export type SecureResult = {
  error?: string;
  saved?: { outcome: string; parent_updated: boolean; appointment: { id: string; scheduled_at: string } | null };
};
export async function saveSecureOutcome(_: SecureResult, form: FormData): Promise<SecureResult> {
  const { client } = await requireStaff(["tele_counsellor"]);
  try {
    const target = z.uuid().parse(form.get("student_id"));
    const requestId = z.uuid().parse(form.get("request_id"));
    const values = Object.fromEntries(form.entries());
    const details = secureDetailsSchema.parse(values);
    const outcome = secureOutcomeSchema.parse(values);
    // Blank parent number keeps the saved one. Callers can add or correct it but never read it.
    const { parent_phone, ...education } = details;
    const { data, error } = await client.rpc("record_counsellor_action", {
      target,
      education: parent_phone ? { ...education, parent_phone } : education,
      action_type: outcome.outcome,
      request_id: requestId,
      visit_at: outcome.outcome === "invite" ? outcome.scheduled_at : null,
      callback_at: outcome.outcome === "callback" || outcome.outcome === "no_answer" ? outcome.next_call_at : null,
      call_remarks: z.string().max(3000).parse(form.get("remarks") || ""),
      reason: outcome.outcome === "dropped" ? outcome.drop_reason : null,
    });
    if (error) return { error: shown(error.message, "Unable to save. Check the outcome and try again.") };
    return {
      saved: {
        outcome: outcome.outcome,
        parent_updated: Boolean(data?.parent_updated),
        appointment: data?.appointment ? { id: data.appointment.id, scheduled_at: data.appointment.scheduled_at } : null,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0].message };
    return { error: "Unable to save. Check the outcome and try again." };
  }
}

export async function sendVisitInvite(appointmentId: string): Promise<{ success?: string; error?: string }> {
  const { client } = await requireStaff(["tele_counsellor"]);
  const provider = callProvider();
  if (!provider) return { error: NOT_CONNECTED };
  const id = z.uuid().safeParse(appointmentId);
  if (!id.success) return { error: "Visit not found." };
  const { data: inviteId, error } = await client.rpc("begin_invite", { appointment: id.data, provider_name: provider.name });
  if (error || typeof inviteId !== "string") return { error: shown(error?.message, "The invite could not be sent. Try again.") };
  const admin = adminClient();
  try {
    const { data: contact, error: contactError } = await admin.rpc("invite_contact", { invite: inviteId });
    if (contactError || !contact) throw new Error("unavailable");
    const sent = await provider.sendInvite({
      inviteId,
      phone: contact.phone,
      name: contact.name,
      scheduledAt: contact.scheduled_at,
      branch: contact.branch,
      address: contact.address,
      maps: contact.maps,
    });
    await admin.rpc("record_invite_result", { invite: inviteId, message_id: sent.providerMessageId, result: sent.status });
    if (sent.status === "failed") return { error: "WhatsApp could not deliver the invite. Try again later." };
    return { success: "Invite sent from the company WhatsApp number." };
  } catch {
    await admin.rpc("record_invite_result", { invite: inviteId, message_id: null, result: "failed" });
    return { error: "The invite could not be sent. Try again." };
  }
}
