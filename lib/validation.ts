import { z } from "zod";
export function normalizePhone(value: string) {
  let digits = value.replace(/[^0-9]/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}
export const phoneSchema = z
  .string()
  .regex(/^[+0-9\s().-]+$/, "Enter a valid Indian phone number.")
  .transform(normalizePhone)
  .pipe(
    z
      .string()
      .regex(/^[0-9]{10}$/, "Enter a valid 10-digit Indian phone number."),
  );
export function indiaDayBounds(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${day}T00:00:00+05:30`);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 86400000).toISOString(),
  };
}

export const registrationSchema = z.string().trim().toUpperCase().regex(/^CS-[A-Z0-9]+-\d{4}-[A-Z0-9]{4,8}$/, "Enter a valid registration number from The Career Solutions.");
