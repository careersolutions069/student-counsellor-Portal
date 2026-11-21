import test from "node:test";
import assert from "node:assert/strict";
import { phoneSchema, indiaDayBounds } from "../lib/validation";
test("phone normalization accepts Indian formats and rejects invalid lengths", () => {
  for (const value of ["9876543210", "+91 98765 43210", "09876543210"])
    assert.equal(phoneSchema.parse(value), "9876543210");
  assert.equal(phoneSchema.safeParse("123").success, false);
  assert.equal(phoneSchema.safeParse("student9876543210").success, false);
  assert.equal(phoneSchema.safeParse("+44 1234567890").success, false);
});
test("today is bounded at midnight in India, including UTC day rollover", () => {
  assert.deepEqual(indiaDayBounds(new Date("2026-11-19T20:00:00Z")), {
    start: "2026-11-19T18:30:00.000Z",
    end: "2026-11-20T18:30:00.000Z",
  });
  assert.deepEqual(indiaDayBounds(new Date("2026-11-20T18:30:00Z")), {
    start: "2026-11-20T18:30:00.000Z",
    end: "2026-11-21T18:30:00.000Z",
  });
});
