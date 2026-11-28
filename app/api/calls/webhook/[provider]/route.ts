import { NextResponse, type NextRequest } from "next/server";
import { callProvider } from "@/lib/calling/provider";
import { applyCallEvents } from "@/lib/calling/events";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** Provider call-status webhook. The signature is checked before anything is recorded. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: name } = await params;
  const provider = callProvider();
  if (!provider || provider.name !== name) return NextResponse.json({ error: "Unknown provider" }, { status: 404, headers });
  const body = await request.text();
  if (body.length > 64 * 1024) return NextResponse.json({ error: "Too large" }, { status: 413, headers });
  const events = provider.parseWebhook({ body, headers: request.headers });
  if (!events) return NextResponse.json({ error: "Invalid signature" }, { status: 401, headers });
  try {
    await applyCallEvents(provider.name, events);
  } catch {
    // The provider retries on failure. Applied events are skipped on retry.
    return NextResponse.json({ error: "Not recorded" }, { status: 500, headers });
  }
  return NextResponse.json({ ok: true, applied: events.length }, { headers });
}
