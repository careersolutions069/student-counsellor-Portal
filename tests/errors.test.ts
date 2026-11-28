import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { userMessage } from "../lib/errors";

test("user-written messages pass through; technical errors are replaced", () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(userMessage(new Error("Choose a non-empty PDF."), "Fallback"), "Choose a non-empty PDF.");
    assert.equal(userMessage(z.string().min(2, "Enter at least 2 characters.").safeParse("a").error, "Fallback"), "Enter at least 2 characters.");
    class PostgrestError extends Error {}
    assert.equal(userMessage(new PostgrestError('duplicate key value violates unique constraint "students_pkey"'), "Fallback"), "Fallback");
    assert.equal(userMessage(new TypeError("fetch failed"), "Fallback"), "Fallback");
    class ServerConfigError extends Error {}
    assert.equal(userMessage(new ServerConfigError("Server configuration missing"), "Fallback"), "Fallback");
    assert.equal(userMessage({ message: "relation does not exist" }, "Fallback"), "Fallback");
  } finally {
    console.error = original;
  }
});
