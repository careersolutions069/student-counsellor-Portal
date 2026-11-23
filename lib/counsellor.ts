import { z } from "zod";
import { phoneSchema } from "@/lib/validation";
import type { Student } from "@/components/student-records";
export const educationSchema = z.object({
  full_name: z.string().trim().min(1, "Enter the student’s name.").max(150),
  city: z.string().max(150).optional(),
  state: z.string().max(150).optional(),
  parent_phone: z.union([z.literal(""), phoneSchema]),
  academic_stream: z.string().max(150),
  percentage_or_score: z.string().max(150),
  target_course: z.string().max(300),
  preferred_locations: z.string().max(500),
  budget_range: z.string().max(150),
});
export const outcomeSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("invite"),
    scheduled_at: z.iso.datetime({ offset: true }),
  }),
  z.object({
    outcome: z.literal("callback"),
    next_call_at: z.iso.datetime({ offset: true }),
  }),
  z.object({
    outcome: z.literal("no_answer"),
    next_call_at: z.iso.datetime({ offset: true }),
  }),
  z.object({
    outcome: z.literal("dropped"),
    drop_reason: z.string().trim().min(1, "Enter a drop reason.").max(1000),
  }),
]);
export type CallerAppointment = {
  id: string;
  student_id: string;
  scheduled_at: string;
  status: string;
};
export type CallLog = {
  id: string;
  student_id: string;
  outcome: string;
  remarks: string | null;
  next_callback_at: string | null;
  created_at: string;
};
export type CallerLead = Student & {
  next_call_at: string | null;
  callback_at: string | null;
  latest_appointment: CallerAppointment | null;
  queue: "to_call" | "invited" | "missed";
};
export type CallerBranch = {
  id: string;
  name: string;
  address: string;
  google_maps_url: string | null;
};
export function inviteUrl(
  phone: string,
  name: string,
  scheduledAt: string,
  branch: CallerBranch,
) {
  const visit = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(scheduledAt));
  const text = `Hello ${name}, your face-to-face counselling visit with The Career Solutions is arranged for ${visit} IST.\nBranch: ${branch.name}\nAddress: ${branch.address}${branch.google_maps_url ? `\nGoogle Maps: ${branch.google_maps_url}` : ""}\nWe look forward to meeting you.`;
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
}
