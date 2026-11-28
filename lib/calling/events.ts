import "server-only";
import { adminClient } from "@/lib/supabase/server";
import type { CallEvent } from "@/lib/calling/provider";

/** Applies provider events. Each event id is applied once, so retried webhooks are safe. */
export async function applyCallEvents(provider: string, events: CallEvent[]) {
  const admin = adminClient();
  for (const event of events) {
    const { error } = await admin.rpc("record_call_event", {
      provider_name: provider,
      event_id: event.eventId.slice(0, 200),
      provider_call: event.providerCallId.slice(0, 200),
      event_status: event.status,
      event_at: event.at ?? null,
      talk: Number.isSafeInteger(event.talkSeconds) ? event.talkSeconds : null,
    });
    if (error) throw new Error("Call event could not be recorded.");
  }
}
