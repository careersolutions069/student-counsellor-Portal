import "server-only";
import { fakeProvider } from "@/lib/calling/fake";

export type CallStatus = "dialled" | "answered" | "busy" | "no_answer" | "failed" | "completed";
export type CallEvent = {
  eventId: string;
  providerCallId: string;
  status: CallStatus;
  at?: string;
  talkSeconds?: number;
};
export type InviteRequest = {
  inviteId: string;
  phone: string;
  name: string;
  scheduledAt: string;
  branch: string;
  address: string;
  maps: string | null;
};
/**
 * A company calling and WhatsApp provider. Numbers reach the provider from the server only.
 * The browser never receives them. Add a real provider here once one is chosen.
 */
export type CallProvider = {
  name: string;
  /** True for the local test provider, which offers simulated call results. */
  test: boolean;
  /** Rings the caller's work phone, then bridges to the customer from the company number. */
  placeCall(input: { attemptId: string; agentPhone: string; customerPhone: string }): Promise<{ providerCallId: string; events?: CallEvent[] }>;
  /** Sends the approved visit-invite template from the company WhatsApp account. */
  sendInvite(input: InviteRequest): Promise<{ providerMessageId: string; status: "sent" | "delivered" | "failed" }>;
  /** Returns the events in a webhook, or null when the signature is not valid. */
  parseWebhook(input: { body: string; headers: Headers }): CallEvent[] | null;
};

export function callProvider(): CallProvider | null {
  const name = process.env.CALL_PROVIDER;
  // The test provider never runs in production, whatever the environment says.
  if (name === "fake" && process.env.VERCEL_ENV !== "production") return fakeProvider();
  return null;
}
