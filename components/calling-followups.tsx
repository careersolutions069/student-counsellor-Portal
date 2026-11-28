import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";
import { dateTime, displayPhone } from "@/lib/utils";
import { bookFollowupVisit, dismissFollowup, reviewCallerAlert } from "@/app/branch/calling/actions";

export type Followup = {
  entry_id: string; student_id: string; full_name: string; phone: string; caller: string;
  file: string | null; campaign: string | null; logged_at: string; callback_at: string | null; remark: string | null;
};
export type CallerAlert = { id: string; caller_id: string; numbers_viewed: number; window_start: string; updated_at: string };

function minutes(a: CallerAlert) {
  const m = Math.max(1, Math.ceil((Date.parse(a.updated_at) - Date.parse(a.window_start)) / 60000));
  return m === 1 ? "1 minute" : `${m} minutes`;
}
/** Alerts for unusual number viewing. Only Centre Heads of the caller's branch receive them. */
export function CallerAlerts({ alerts, names }: { alerts: CallerAlert[]; names: Record<string, string> }) {
  if (!alerts.length) return null;
  return (
    <section aria-labelledby="alerts-title" className="space-y-3 rounded-[14px] border-[1.5px] border-[#F4C7C1] bg-danger-bg p-5">
      <h2 id="alerts-title" className="section-title !text-danger-text">Number viewing alerts</h2>
      {alerts.map((a) => (
        <article key={a.id} className="space-y-2 rounded-xl bg-white p-4">
          <p className="text-sm">
            <strong>{names[a.caller_id] || "A tele-counsellor"}</strong> opened <strong className="num">{a.numbers_viewed}</strong> different student numbers
            within {minutes(a)} from {dateTime(a.window_start)} IST.
          </p>
          <p className="text-xs text-muted">Each number counts once in a 15-minute window, even after a refresh. The alert starts at 40. Check the caller’s logged outcomes for these minutes.</p>
          <ActionForm action={reviewCallerAlert} submit="Mark reviewed" variant="outline">
            <input type="hidden" name="alert_id" value={a.id} />
          </ActionForm>
        </article>
      ))}
    </section>
  );
}

/** Interested students waiting for a visit. Booking a visit removes them from this list. */
export function InterestedFollowups({ items }: { items: Followup[] }) {
  return (
    <section aria-labelledby="followups-title" className="panel space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="followups-title" className="section-title">Interested follow-ups</h2>
        <span className="num text-sm text-muted">{items.length} waiting</span>
      </div>
      <p className="text-sm text-muted">Students a caller marked Interested without a booked visit. Booking a visit, here or from the caller’s desk, removes them.</p>
      {!items.length ? (
        <p className="text-muted">No interested students are waiting.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((f) => (
            <li key={f.entry_id} className="space-y-3 rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="break-words text-navy">{f.full_name}</strong>
                <a href={`tel:+91${f.phone}`} className="num font-semibold text-primary">{displayPhone(f.phone)}</a>
              </div>
              <p className="text-sm text-muted">
                {[`Marked by ${f.caller}`, dateTime(f.logged_at), [f.file, f.campaign].filter(Boolean).join(" · "), f.callback_at && `Callback ${dateTime(f.callback_at)}`].filter(Boolean).join(" · ")}
              </p>
              {f.remark && <p className="whitespace-pre-line rounded-lg bg-[#FBF9F4] p-2.5 text-sm">{f.remark}</p>}
              <div className="flex flex-wrap items-end gap-3">
                <ActionForm action={bookFollowupVisit} submit="Book visit" className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="entry_id" value={f.entry_id} />
                  <Field label="Visit date & time · IST" name="scheduled_at" type="datetime-local" required />
                </ActionForm>
                <ActionForm action={dismissFollowup} submit="Remove from list" variant="outline">
                  <input type="hidden" name="entry_id" value={f.entry_id} />
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
