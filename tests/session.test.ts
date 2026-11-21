import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import {
  hash,
  newSessionToken,
  signStudentSession,
  verifyStudentSession,
} from "../lib/session";
process.env.STUDENT_SESSION_SECRET =
  "test-only-secret-with-more-than-thirty-two-characters";
test("signed student session validates identity and only exposes the token hash to queries", async () => {
  const token = newSessionToken();
  const cookie = await signStudentSession("student-1", token);
  assert.deepEqual(await verifyStudentSession(cookie), {
    studentId: "student-1",
    tokenHash: hash(token),
  });
  assert.equal(
    await verifyStudentSession(cookie.slice(0, -8) + "tampered"),
    null,
  );
  assert.equal(await verifyStudentSession(), null);
});
test("expired and wrong audience tokens are rejected", async () => {
  const secret = new TextEncoder().encode(process.env.STUDENT_SESSION_SECRET);
  const expired = await new SignJWT({ student_id: "student-1" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("career-solution")
    .setAudience("student")
    .setSubject("student-1")
    .setJti("token")
    .setIssuedAt()
    .setExpirationTime("0s")
    .sign(secret);
  assert.equal(await verifyStudentSession(expired), null);
  const otherAudience = await new SignJWT({ student_id: "student-1" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("career-solution")
    .setAudience("staff")
    .setSubject("student-1")
    .setJti("token")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
  assert.equal(await verifyStudentSession(otherAudience), null);
});
