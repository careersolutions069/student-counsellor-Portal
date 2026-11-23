import test from "node:test";
import assert from "node:assert/strict";
import { educationSchema, outcomeSchema, inviteUrl } from "../lib/counsellor";
test("each outcome validates its required next step", () => {
  assert.equal(outcomeSchema.safeParse({ outcome: "invite" }).success, false);
  assert.equal(outcomeSchema.safeParse({ outcome: "callback" }).success, false);
  assert.equal(
    outcomeSchema.safeParse({ outcome: "no_answer" }).success,
    false,
  );
  assert.equal(
    outcomeSchema.safeParse({ outcome: "dropped", drop_reason: "   " }).success,
    false,
  );
  assert.equal(
    outcomeSchema.parse({
      outcome: "invite",
      scheduled_at: "2026-11-21T10:30:00+05:30",
    }).outcome,
    "invite",
  );
  assert.equal(
    outcomeSchema.parse({
      outcome: "no_answer",
      next_call_at: "2026-11-21T10:30:00+05:30",
    }).outcome,
    "no_answer",
  );
});
test("education preserves allowed fields and normalizes a shared parent phone", () => {
  const value = educationSchema.parse({
    full_name: "Aditi",
    parent_phone: "+91 98765 43210",
    academic_stream: "Commerce",
    percentage_or_score: "85%",
    target_course: "B.Com",
    preferred_locations: "Patna",
    budget_range: "2 lakh",
    branch_id: "untrusted",
  });
  assert.equal(value.parent_phone, "9876543210");
  assert.equal("branch_id" in value, false);
});
test("WhatsApp invitation includes branch, visit time and maps safely", () => {
  const url = new URL(
    inviteUrl("9000000001", "Aditi & family", "2026-11-21T05:00:00Z", {
      id: "branch",
      name: "Patna",
      address: "Boring Road, Patna",
      google_maps_url: "https://www.google.com/maps/search/?query=Patna",
    }),
  );
  assert.equal(url.origin, "https://wa.me");
  assert.equal(url.pathname, "/919000000001");
  const message = url.searchParams.get("text")!;
  assert.ok(message.includes("The Career Solutions") && !/Career Solution(?!s)|The The/.test(message), "Agency name is exact");
  for (const value of [
    "Aditi & family",
    "21 November 2026",
    "10:30",
    "IST",
    "Patna",
    "Boring Road",
    "https://www.google.com/maps/",
  ])
    assert.ok(message.includes(value), value);
});
