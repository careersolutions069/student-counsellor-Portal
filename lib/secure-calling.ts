import { z } from "zod";
import { phoneSchema } from "@/lib/validation";

/** What a secure-branch caller receives. There is deliberately no phone field. */
export type DeskAttempt = { id: string; contact: "student" | "parent"; status: AttemptStatus; talk_seconds: number | null };
export type AttemptStatus = "requested" | "ringing" | "answered" | "busy" | "no_answer" | "failed" | "completed";
export type DeskLead = {
  id: string;
  first_name: string;
  pipeline_stage: string;
  target_course: string | null;
  academic_stream: string | null;
  percentage_or_score: string | null;
  city: string | null;
  state: string | null;
  preferred_locations: string | null;
  budget_range: string | null;
  lead_source: string | null;
  next_call_at: string | null;
  has_parent_phone: boolean;
  reason: "new" | "callback" | "missed";
  latest_appointment: { id: string; scheduled_at: string; status: string } | null;
  calls: { id: string; outcome: string; remarks: string | null; created_at: string }[];
  attempt: DeskAttempt | null;
};
export type DeskToday = { attempts: number; answered: number; conversations: number; short_calls: number; visits_booked: number };
export type Desk = { target: number; work_phone_set: boolean; today: DeskToday; callbacks_due: number; lead: DeskLead | null };

export const ACTIVE_ATTEMPT: AttemptStatus[] = ["requested", "ringing", "answered"];
export const SECURE_OUTCOMES = [
  ["invite", "Interested · book a visit"],
  ["callback", "Asked for a callback"],
  ["no_answer", "No answer or busy"],
  ["dropped", "Not interested"],
  ["wrong_number", "Wrong number"],
  ["do_not_contact", "Asked not to be called again"],
] as const;

const text = (max: number) => z.string().trim().max(max);
export const secureDetailsSchema = z.object({
  target_course: text(300),
  academic_stream: text(150),
  percentage_or_score: text(150),
  city: text(150),
  state: text(150),
  preferred_locations: text(500),
  budget_range: text(150),
  parent_phone: z.union([z.literal(""), phoneSchema]),
});
const datetime = z.iso.datetime({ offset: true, message: "Choose a date and time." });
export const secureOutcomeSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("invite"), scheduled_at: datetime }),
  z.object({ outcome: z.literal("callback"), next_call_at: datetime }),
  z.object({ outcome: z.literal("no_answer"), next_call_at: datetime }),
  z.object({ outcome: z.literal("dropped"), drop_reason: z.string().trim().min(1, "Enter why they are not interested.").max(1000) }),
  z.object({ outcome: z.literal("wrong_number") }),
  z.object({ outcome: z.literal("do_not_contact") }),
], { error: "Choose the call outcome." });

export function talkTime(seconds: number | null) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} min ${s} s` : `${s} s`;
}
export function attemptLabel(attempt: DeskAttempt | null) {
  if (!attempt) return "";
  const who = attempt.contact === "parent" ? "parent" : "student";
  switch (attempt.status) {
    case "requested":
      return "Connecting… your work phone will ring first.";
    case "ringing":
      return `Ringing the ${who}…`;
    case "answered":
      return `Connected to the ${who}.`;
    case "completed":
      return `Call ended · ${talkTime(attempt.talk_seconds) || "no talk time"}.`;
    case "busy":
      return `The ${who}'s line was busy.`;
    case "no_answer":
      return `The ${who} did not answer.`;
    case "failed":
      return "The call could not be placed.";
  }
}
