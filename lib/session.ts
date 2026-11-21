import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
export const STUDENT_COOKIE = "cs_student";
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function secret() {
  const value = process.env.STUDENT_SESSION_SECRET;
  if (!value || value.length < 32)
    throw new Error(
      "STUDENT_SESSION_SECRET must contain at least 32 characters.",
    );
  return new TextEncoder().encode(value);
}
export async function signStudentSession(studentId: string, token: string) {
  return new SignJWT({ student_id: studentId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("career-solution")
    .setAudience("student")
    .setSubject(studentId)
    .setJti(token)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}
export async function verifyStudentSession(value?: string) {
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, secret(), {
      algorithms: ["HS256"],
      issuer: "career-solution",
      audience: "student",
      maxTokenAge: "8h",
    });
    if (
      typeof payload.student_id !== "string" ||
      payload.sub !== payload.student_id ||
      typeof payload.jti !== "string"
    )
      return null;
    return { studentId: payload.student_id, tokenHash: hash(payload.jti) };
  } catch {
    return null;
  }
}
export function newSessionToken() {
  return randomBytes(32).toString("hex");
}
