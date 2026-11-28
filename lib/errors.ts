import { z } from "zod";
/**
 * Text that is safe to show a user. Messages written for users (plain `Error` and validation issues) pass through;
 * anything else — database, storage, network or configuration errors — is logged for staff and replaced.
 */
export function userMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Error && error.constructor === Error) return error.message;
  console.error("Portal action failed", error instanceof Error ? `${error.name}: ${error.message}` : error);
  return fallback;
}
