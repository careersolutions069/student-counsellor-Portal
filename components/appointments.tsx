import { ActionForm } from "@/components/action-form";
import { markAppointment } from "@/app/actions";
import { Badge } from "@/components/shell";
import { dateTime } from "@/lib/utils";
import { ProfileCompletion } from "@/components/profile-completion";
import type { Student } from "@/components/student-records";
export type Meeting = {
  id: string;
  scheduled_at: string;
  status: string;
  branch_id: string;
  students: Student | null;
};
export function Appointments({ meetings }: { meetings: Meeting[] }) {
  return (
    <section className="panel space-y-5">
      <div>
        <h2 className="section-title">F2F appointments</h2>
        <p className="mt-1 text-sm text-muted">
          Pending, today and upcoming visits. Times are shown in India Standard Time.
        </p>
      </div>
      {meetings.length === 0 && (
        <p className="text-muted">
          No pending, today or upcoming appointments.
        </p>
      )}
      {meetings.map((m) => (
        <article key={m.id} className="rounded-xl border border-line p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {m.students?.full_name || "Student unavailable"}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {dateTime(m.scheduled_at)} · {m.students?.student_phone}
              </p>
            </div>
            <Badge>{m.status === "completed" ? "attended" : m.status}</Badge>
          </div>
          {m.students && (
            <dl className="mt-4 grid gap-3 rounded-lg bg-[#FBF9F4] p-4 text-sm sm:grid-cols-2">
              {[
                ["Parent phone", m.students.parent_phone],
                ["Target course", m.students.target_course],
                ["Academic stream", m.students.academic_stream],
                ["Percentage or score", m.students.percentage_or_score],
                ["Preferred locations", m.students.preferred_locations],
                ["Budget range", m.students.budget_range],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="mt-1 font-medium">
                    {value || "To be discussed"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {m.status !== "cancelled" && (
            <div className="mt-4 flex flex-wrap gap-3">
              <ActionForm action={markAppointment} submit="Mark Attended">
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="status" value="attended" />
              </ActionForm>
              <ActionForm
                action={markAppointment}
                submit="Mark Missed"
                variant="outline"
              >
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="status" value="missed" />
              </ActionForm>
            </div>
          )}
          {["attended", "completed"].includes(m.status) && m.students && (
            <details className="mt-5">
              <summary className="font-semibold text-primary">
                {m.students.is_profile_complete
                  ? "Visit details & student login"
                  : "Complete visit details & generate registration ID"}
              </summary>
              <div className="mt-4">
                <ProfileCompletion student={m.students} />
              </div>
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
