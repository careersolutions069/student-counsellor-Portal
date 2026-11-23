import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
function indiaParts(value: string, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...options }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}
/** "Sat, 28 Nov 2026" in IST. */
export function visitDate(value: string) {
  const p = indiaParts(value, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}
/** "11:30 am" in IST. */
export function visitTime(value: string) {
  const p = indiaParts(value, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}
/** { weekday: "SAT", day: "28", month: "NOV" } in IST for the date tile. */
export function visitTile(value: string) {
  const p = indiaParts(value, { weekday: "short", day: "numeric", month: "short" });
  return { weekday: p.weekday.toUpperCase(), day: p.day, month: p.month.toUpperCase() };
}
