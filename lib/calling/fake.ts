import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { CallEvent, CallProvider, CallStatus } from "@/lib/calling/provider";

const STATUSES: CallStatus[] = ["dialled", "answered", "busy", "no_answer", "failed", "completed"];

export function signFakeWebhook(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Local test provider. It never dials anyone and never logs a number. */
export function fakeProvider(): CallProvider {
  return {
    name: "fake",
    test: true,
    async placeCall({ attemptId }) {
      const providerCallId = `fake-${attemptId}`;
      // A real provider reports "dialled" by webhook. The test provider reports it straight away.
      return { providerCallId, events: [{ eventId: randomUUID(), providerCallId, status: "dialled" }] };
    },
    async sendInvite() {
      return { providerMessageId: `fake-msg-${randomUUID()}`, status: "sent" };
    },
    parseWebhook({ body, headers }) {
      const secret = process.env.CALL_WEBHOOK_SECRET;
      const signature = headers.get("x-fake-signature") || "";
      if (!secret) return null;
      const expected = Buffer.from(signFakeWebhook(body, secret));
      const given = Buffer.from(signature);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      try {
        const parsed = JSON.parse(body) as { events?: unknown };
        if (!Array.isArray(parsed.events) || parsed.events.length > 20) return null;
        return parsed.events.filter((event): event is CallEvent => {
          const e = event as CallEvent;
          return typeof e?.eventId === "string" && typeof e.providerCallId === "string" && STATUSES.includes(e.status);
        });
      } catch {
        return null;
      }
    },
  };
}
