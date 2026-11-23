// Keep in sync with shortlist_admission_status_valid in
// supabase/migrations/20261123090000_reporting_and_admission_status.sql.
export const ADMISSION_STATUSES = [
  "Pending",
  "Applied",
  "Admission Confirmed",
  "Not Admitted",
  "Withdrawn",
] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];
export const ADMISSION_STATUS_ERROR = "Choose a valid admission status.";
export function isAdmissionStatus(value: unknown): value is AdmissionStatus {
  return ADMISSION_STATUSES.includes(value as AdmissionStatus);
}
