import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";
import { Badge } from "@/components/shell";
import { saveCallerSettings, changeCallingStatus } from "@/app/branch/calling/actions";
import type { DeskToday } from "@/lib/secure-calling";

export type CallerActivity = {
  secure_calling: boolean;
  callers: { id: string; full_name: string; is_active: boolean; daily_attempt_target: number; work_phone: string | null; assigned: number; today: DeskToday }[];
  held: { id: string; full_name: string; calling_status: "held" | "do_not_contact"; calling_note: string | null; lead_source: string | null; consent_basis: string | null; lead_received_on: string | null }[];
  held_total: number;
};
const CONSENT: Record<string, string> = { direct_enquiry: "Enquired directly", third_party: "Third-party list", unknown: "Consent unclear" };

export function CallingAdmin({ activity,manual,manualToday={} }: { activity: CallerActivity;manual:boolean;manualToday?:Record<string,{logged:number;quick:number}> }) {
  const callers = activity.callers.filter((c) => c.is_active);
  return (
    <div className="space-y-5">
      <p className={`rounded-xl p-3 text-sm ${activity.secure_calling ? "bg-success-bg text-success" : "bg-marigold-50 text-marigold-text"}`}>
        {manual ? "Manual calling is on. Callers see their current student’s number and dial on their phone." : activity.secure_calling
          ? "Company calling is on. Callers see one student at a time and never see a phone number."
          : "Company calling is off for this branch. Callers still dial directly and can see numbers. Set targets and work phones now so the pilot can start."}
      </p>

      <section aria-labelledby="callers-title" className="panel space-y-4">
        <h2 id="callers-title" className="section-title">Tele-counsellors today</h2>
        {!callers.length && <p className="text-muted">No active tele-counsellors in this branch.</p>}
        <div className="space-y-3">
          {callers.map((c) => {
            const t = c.today;
            const percent = Math.min(100, Math.round((t.attempts / Math.max(1, c.daily_attempt_target)) * 100));
            return (
              <article key={c.id} className="space-y-3 rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-navy">{c.full_name}</h3>
                  {!manual&&<p className="num text-sm text-muted">
                    <strong className="text-navy">{t.attempts}</strong> of {c.daily_attempt_target} calls · {c.assigned} assigned
                  </p>}
                </div>
                {manual&&(()=>{const m=manualToday[c.id]||{logged:0,quick:0};return <p className="num text-sm text-muted">
                  <strong className="text-navy">{m.logged}</strong> of {c.daily_attempt_target} calls logged today
                  {m.quick>0&&<span className={m.logged>=10&&m.quick*2>m.logged?" font-semibold text-danger-text":""}> · {m.quick} logged within 20 s of the previous call{m.logged>=10&&m.quick*2>m.logged?" — check these entries":""}</span>}
                </p>;})()}
                <Link className="font-semibold text-primary underline" href={`/calling-report?caller=${c.id}`}>Daily manual calling report</Link>
                {!manual&&<><div className="h-2 overflow-hidden rounded-full bg-sand" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
                <dl className="num grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  {[
                    ["Answered", t.answered],
                    ["Conversations", t.conversations],
                    ["Visits booked", t.visits_booked],
                    ["Answered under 10 s", t.short_calls],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-[#FBF9F4] px-3 py-2">
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="font-bold text-navy">{value}</dd>
                    </div>
                  ))}
                </dl></>}
                <details>
                  <summary className="text-sm font-semibold text-primary">Daily target and work phone</summary>
                  <ActionForm action={saveCallerSettings} submit="Save" variant="outline" className="mt-3">
                    <input type="hidden" name="id" value={c.id} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Daily call target" name="daily_attempt_target" type="number" min={1} max={2000} defaultValue={c.daily_attempt_target} required />
                      <Field label="Work phone the company line rings" name="work_phone" type="tel" inputMode="numeric" defaultValue={c.work_phone || ""} placeholder="10-digit mobile number" />
                    </div>
                  </ActionForm>
                </details>
              </article>
            );
          })}
        </div>
        {!manual&&<p className="text-xs text-muted">A call counts once the company line dials the student. Callbacks count toward the target too.</p>}
      </section>

      <section aria-labelledby="held-title" className="panel space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="held-title" className="section-title">Held and Do not call</h2>
          <span className="num text-sm text-muted">{activity.held_total} leads</span>
        </div>
        <p className="text-sm text-muted">Held leads are never dialled. Release a lead once its consent or number is confirmed.</p>
        {activity.held.length === 0 ? (
          <p className="text-muted">No leads are held.</p>
        ) : (
          <ActionForm action={changeCallingStatus} submit="Apply to selected">
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
              {activity.held.map((s) => (
                <li key={s.id}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm">
                    <input type="checkbox" name="ids" value={s.id} className="mt-0.5 size-5 accent-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="break-words text-navy">{s.full_name}</strong>
                        <Badge>{s.calling_status === "do_not_contact" ? "Do not call" : "Held"}</Badge>
                      </span>
                      <span className="block text-muted">
                        {[s.calling_note, s.lead_source, s.consent_basis && CONSENT[s.consent_basis], s.lead_received_on && `Received ${s.lead_received_on}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-2 text-sm font-semibold text-ink">For the selected leads</legend>
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="status" value="eligible" required className="size-5 accent-primary" /> Release for calling
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="status" value="do_not_contact" className="size-5 accent-primary" /> Mark Do not call
              </label>
            </fieldset>
          </ActionForm>
        )}
        {activity.held_total > activity.held.length && <p className="text-xs text-muted">Showing the latest {activity.held.length}.</p>}
      </section>
    </div>
  );
}
