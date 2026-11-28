"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import type { ActionState } from "@/app/actions";

export async function saveCallerSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireStaff(["centre_head"]);
  const parsed = z
    .object({
      id: z.uuid(),
      daily_attempt_target: z.coerce.number().int("Enter a whole number.").min(1, "Daily target must be at least 1.").max(2000, "Daily target must be 2000 or fewer."),
      work_phone: z.union([z.literal(""), z.string().trim().regex(/^(\+?91[\s-]?)?[0-9][0-9\s-]{8,12}$/, "Enter a valid 10-digit work phone.")]),
    })
    .safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await client.rpc("set_caller_settings", {
    target: parsed.data.id,
    attempt_target: parsed.data.daily_attempt_target,
    phone: parsed.data.work_phone || null,
  });
  if (error) return { error: error.message.startsWith("Daily target") ? error.message : "Unable to save. Check the work phone and try again." };
  revalidatePath("/branch/calling");
  return { success: "Caller settings saved." };
}

export async function changeCallingStatus(_: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireStaff(["centre_head"]);
  const ids = z.array(z.uuid()).min(1, "Select at least one lead.").max(500).safeParse(form.getAll("ids"));
  const status = z.enum(["eligible", "do_not_contact"]).safeParse(form.get("status"));
  if (!ids.success) return { error: ids.error.issues[0].message };
  if (!status.success) return { error: "Choose what to do with the selected leads." };
  const { data, error } = await client.rpc("set_calling_status", { ids: ids.data, new_status: status.data });
  if (error) return { error: "Unable to update the selected leads." };
  revalidatePath("/branch/calling");
  return { success: status.data === "eligible" ? `${data} lead${data === 1 ? "" : "s"} released for calling.` : `${data} lead${data === 1 ? "" : "s"} marked Do not call.` };
}

export async function bookFollowupVisit(_: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireStaff(["centre_head"]);
  const entry = z.uuid().safeParse(form.get("entry_id"));
  const when = z.iso.datetime({ offset: true }).safeParse(form.get("scheduled_at"));
  if (!entry.success) return { error: "Refresh and try again." };
  if (!when.success) return { error: "Choose the visit date and time." };
  const { error } = await client.rpc("book_followup_visit", { entry: entry.data, visit_at: when.data });
  if (error) return { error: error.message === "Choose a future visit time." ? error.message : "Unable to book. Refresh and check the list." };
  revalidatePath("/branch/calling");
  revalidatePath("/branch");
  return { success: "Visit booked. It now shows under F2F Appointments." };
}

export async function dismissFollowup(_: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireStaff(["centre_head"]);
  const entry = z.uuid().safeParse(form.get("entry_id"));
  if (!entry.success) return { error: "Refresh and try again." };
  const { error } = await client.rpc("dismiss_followup", { entry: entry.data });
  if (error) return { error: "Unable to update. Refresh and check the list." };
  revalidatePath("/branch/calling");
  return { success: "Removed from the follow-up list." };
}

export async function reviewCallerAlert(_: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireStaff(["centre_head"]);
  const alert = z.uuid().safeParse(form.get("alert_id"));
  if (!alert.success) return { error: "Refresh and try again." };
  const { error } = await client.rpc("review_caller_alert", { alert: alert.data });
  if (error) return { error: "Unable to update. Refresh and check the alerts." };
  revalidatePath("/branch/calling");
  return { success: "Alert marked as reviewed." };
}
