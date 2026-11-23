import Link from "next/link";
import { ArrowLeft, CalendarDays, Phone } from "lucide-react";
import { StatusBadge } from "@/components/shell";
import { AttendanceActions } from "@/components/attendance-actions";
import { VisitConversion } from "@/components/visit-conversion";
import { RegistrationSection } from "@/components/registration-section";
import { NavigationPending } from "@/components/navigation-pending";
import { indiaDayBounds } from "@/lib/validation";
import { displayPhone, visitDate, visitTime } from "@/lib/utils";
import type { Student } from "@/components/student-records";
export type Meeting = {
  id: string;
  scheduled_at: string;
  status: string;
  branch_id: string;
  created_by?: string | null;
  students: Student | null;
};
const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  attended: "Attended",
  completed: "Attended",
  missed: "Missed",
  cancelled: "Cancelled",
};
function phone(value: string | null | undefined) {
  return displayPhone(value) || "—";
}
function dayLabel(value: string) {
  const { start, end } = indiaDayBounds();
  const at = new Date(value).getTime();
  if (at >= new Date(start).getTime() && at < new Date(end).getTime()) return "Today";
  return visitDate(value).replace(/ \d{4}$/, "");
}
/** Centre Head / Owner appointments: list + selected student. One column below 1024 px. */
export function Appointments({
  meetings,
  selectedId,
  hrefFor,
  backHref,
  staffNames,
  branchNames,
}: {
  meetings: Meeting[];
  selectedId?: string;
  hrefFor: (id: string) => string;
  backHref: string;
  staffNames: Record<string, string>;
  branchNames?: Record<string, string>;
}) {
  const explicit = Boolean(selectedId);
  const selected = meetings.find((m) => m.id === selectedId) || (explicit ? undefined : meetings[0]);
  if (!meetings.length)
    return (
      <section className="panel flex flex-col items-start gap-2 py-10">
        <CalendarDays size={28} aria-hidden="true" className="text-primary" />
        <h2 className="text-lg font-bold text-navy">No appointments to show</h2>
        <p className="max-w-prose text-muted">
          There are no scheduled, today’s or upcoming visits. When a tele-counsellor arranges a visit it appears here with the student’s details.
        </p>
      </section>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:items-start">
      <section
        aria-label="Appointments"
        className={`${explicit ? "hidden lg:block" : ""} overflow-hidden rounded-[14px] border border-line bg-white lg:sticky lg:top-4`}
      >
        <p className="border-b border-line bg-[#FBF9F4] px-4 py-2.5 text-[13px] text-muted">
          Scheduled, today’s and upcoming visits · IST
        </p>
        <ul>
          {meetings.map((m) => {
            const current = selected?.id === m.id && explicit;
            const desktopDefault = selected?.id === m.id && !explicit;
            return (
              <li key={m.id} className="border-t border-sand first:border-t-0">
                <Link
                  href={hrefFor(m.id)}
                  aria-current={current ? "true" : undefined}
                  className={`flex gap-3 px-4 py-3 transition-colors ${current ? "bg-teal-soft shadow-[inset_4px_0_0_#E8A317]" : desktopDefault ? "hover:bg-[#FBF9F4] lg:bg-teal-soft lg:shadow-[inset_4px_0_0_#E8A317]" : "hover:bg-[#FBF9F4]"}`}
                >
                  <span className="num w-[72px] shrink-0 pt-0.5 text-sm">
                    <span className="block font-bold text-navy">{visitTime(m.scheduled_at)}</span>
                    <span className="text-xs text-muted">{dayLabel(m.scheduled_at)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block break-words text-navy">{m.students?.full_name || "Student unavailable"}</strong>
                    <span className="num block text-sm text-muted">
                      {phone(m.students?.student_phone)}
                      {branchNames && ` · ${branchNames[m.branch_id] || "Branch"}`}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <StatusBadge status={m.status} label={STATUS_LABEL[m.status] || m.status} />
                      <NavigationPending />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {selected ? (
        <AppointmentDetail
          key={selected.id}
          meeting={selected}
          hidden={!explicit}
          backHref={backHref}
          invitedBy={selected.created_by ? staffNames[selected.created_by] : undefined}
        />
      ) : (
        <section className="panel space-y-3">
          <p className="font-semibold text-navy">This appointment is no longer in the list.</p>
          <p className="text-muted">It may have been cancelled or moved. Go back to the list to choose another visit.</p>
          <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary">
            <ArrowLeft size={18} aria-hidden="true" /> All appointments
          </Link>
        </section>
      )}
    </div>
  );
}
function AppointmentDetail({
  meeting: m,
  hidden,
  backHref,
  invitedBy,
}: {
  meeting: Meeting;
  hidden: boolean;
  backHref: string;
  invitedBy?: string;
}) {
  const s = m.students;
  const attended = ["attended", "completed"].includes(m.status);
  const education: [string, string | null | undefined][] = s
    ? [
        ["Target course", s.target_course],
        ["Marks", s.percentage_or_score && `${s.percentage_or_score}${s.marks_type ? ` · ${s.marks_type}` : ""}`],
        ["Academic stream", s.academic_stream],
        ["Preferred locations", s.preferred_locations],
        ["City / state", [s.city, s.state].filter(Boolean).join(", ")],
        ["Budget range · internal", s.budget_range],
      ]
    : [];
  return (
    <section aria-labelledby="appointment-student" className={`${hidden ? "hidden lg:block" : ""} min-w-0 space-y-4`}>
      <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary lg:hidden">
        <ArrowLeft size={18} aria-hidden="true" /> All appointments
      </Link>
      <div className="space-y-4 rounded-[14px] border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="appointment-student" className="break-words text-2xl font-bold tracking-[-0.02em] text-navy">
              {s?.full_name || "Student unavailable"}
            </h2>
            <p className="num mt-1 text-sm text-[#3E4F59]">
              {visitDate(m.scheduled_at)}, {visitTime(m.scheduled_at)} IST
              {invitedBy && <> · invited by {invitedBy}</>}
            </p>
          </div>
          <StatusBadge status={m.status} label={STATUS_LABEL[m.status] || m.status} />
        </div>
        {s && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href={`tel:+91${s.student_phone}`} className="num inline-flex min-h-11 items-center gap-2 font-semibold text-primary">
              <Phone size={17} aria-hidden="true" /> Student {phone(s.student_phone)}
            </a>
            {s.parent_phone && (
              <a href={`tel:+91${s.parent_phone}`} className="num inline-flex min-h-11 items-center gap-2 font-semibold text-primary">
                <Phone size={17} aria-hidden="true" /> Parent {phone(s.parent_phone)}
              </a>
            )}
          </div>
        )}
        {m.status !== "cancelled" && <AttendanceActions appointmentId={m.id} status={m.status} />}
        {m.status === "missed" && (
          <p className="rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning">
            This student is back in the tele-counsellor’s Missed / Re-Invite queue.
          </p>
        )}
      </div>
      {s && (
        <div className="rounded-[14px] border border-line bg-white p-4 sm:p-5">
          <h3 className="mb-3 text-base font-bold text-navy">Education details</h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {education.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[13px] text-muted">{label}</dt>
                <dd className="break-words font-semibold">{value || <span className="font-normal text-muted">Not captured yet</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {attended && s && (
        <>
          <VisitConversion student={s} />
          <RegistrationSection student={s} origin={process.env.NEXT_PUBLIC_PORTAL_URL || ""} />
        </>
      )}
      {!attended && m.status === "scheduled" && (
        <p className="text-sm text-muted">Visit details and the student login unlock after you mark the visit Attended.</p>
      )}
    </section>
  );
}
