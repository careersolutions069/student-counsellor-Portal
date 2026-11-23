"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/fields";
import { ParentPhoneField } from "@/components/parent-phone-field";
import { dateTime, displayPhone } from "@/lib/utils";
import { inviteUrl, type CallerLead, type CallerBranch, type CallLog } from "@/lib/counsellor";
import { recordCallerAction, callerHistory, type CallerResult } from "@/app/counsellor/actions";
const OUTCOMES = [
  ["invite", "Agreed to Meet (Arrange Invite)"],
  ["callback", "Call Back Later"],
  ["no_answer", "No Answer"],
  ["dropped", "Not Interested / Dropped"],
] as const;
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="space-y-3">
      <h3 id={`step-${n}`} className="text-xs font-bold uppercase tracking-[0.05em] text-muted">
        {n} · {title}
      </h3>
      {children}
    </section>
  );
}
/** One open lead: 1 call and review, 2 outcome, 3 next action. Sticky save on phones. */
export function CallRecord({
  lead,
  branch,
  backHref,
  hidden,
}: {
  lead: CallerLead;
  branch: CallerBranch;
  backHref: string;
  hidden: boolean;
}) {
  const [education, setEducation] = useState({
    full_name: lead.full_name,
    city: lead.city || "",
    state: lead.state || "",
    parent_phone: lead.parent_phone || "",
    academic_stream: lead.academic_stream || "",
    percentage_or_score: lead.percentage_or_score || "",
    target_course: lead.target_course || "",
    preferred_locations: lead.preferred_locations || "",
    budget_range: lead.budget_range || "",
  });
  const [appointment, setAppointment] = useState(lead.latest_appointment);
  const [savedName, setSavedName] = useState(lead.full_name);
  const [outcome, setOutcome] = useState("");
  const [remarks, setRemarks] = useState("");
  const [nonce, setNonce] = useState(() => crypto.randomUUID());
  const [history, setHistory] = useState<CallLog[]>([]);
  const [added, setAdded] = useState<CallLog[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [invited, setInvited] = useState(false);
  // Blocks a second submit before React re-renders the disabled button (double-click).
  const locked = useRef(false);
  useEffect(() => {
    let cancelled = false;
    callerHistory(lead.id).then((result) => {
      if (!cancelled) {
        setHistory(result.calls);
        setHasMore(result.hasMore);
        setHistoryError(result.error || "");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lead.id]);
  const [state, action, pending] = useActionState(
    async (previous: CallerResult, form: FormData): Promise<CallerResult> => {
      for (const name of ["scheduled_at", "next_call_at"]) {
        const value = form.get(name);
        if (typeof value === "string" && value) form.set(name, `${value}:00+05:30`);
      }
      const detailsOnly = form.get("intent") === "details";
      let result: CallerResult;
      try {
        result = await recordCallerAction(previous, form);
      } catch {
        // Network drop or server restart: keep the record open with everything typed.
        return { error: "We couldn’t reach the server, so nothing was saved. Check your connection and select Save call outcome again." };
      } finally {
        locked.current = false;
      }
      if (result.success) {
        setSavedName(result.student_name || education.full_name);
        if (!detailsOnly) {
          setAppointment(result.appointment || null);
          setInvited(form.get("outcome") === "invite");
          setOutcome("");
          setRemarks("");
        }
        if (result.call) {
          setAdded((old) => (old.some((c) => c.id === result.call!.id) ? old : [result.call!, ...old]));
          setNonce(crypto.randomUUID());
        }
      }
      // On failure every field keeps what was typed.
      return result;
    },
    {},
  );
  const calls = [...added, ...history].filter((call, index, all) => all.findIndex((c) => c.id === call.id) === index);
  async function loadMore() {
    setLoading(true);
    const last = history.at(-1);
    const result = await callerHistory(lead.id, last ? { created_at: last.created_at, id: last.id } : undefined);
    setHistory((old) => [...old, ...result.calls]);
    setHasMore(result.hasMore);
    setHistoryError(result.error || "");
    setLoading(false);
  }
  const scheduledVisit = appointment?.status === "scheduled" ? appointment : null;
  const summary: [string, string][] = [
    ["Target course", education.target_course],
    ["Marks", education.percentage_or_score],
    ["Stream", education.academic_stream],
    ["Parent phone", displayPhone(education.parent_phone)],
    ["Preferred locations", education.preferred_locations],
    ["City", [education.city, education.state].filter(Boolean).join(", ")],
  ];
  return (
    <section aria-labelledby="lead-name" className={`${hidden ? "hidden lg:block" : ""} min-w-0`}>
      <Link href={backHref} className="mb-2 inline-flex min-h-11 items-center gap-2 font-semibold text-primary lg:hidden">
        <ArrowLeft size={18} aria-hidden="true" /> Back to queue
      </Link>
      <form
        action={action}
        onSubmit={(event) => {
          if (locked.current) event.preventDefault();
          else locked.current = true;
        }}
        onReset={(event) => event.preventDefault()}
        className="min-w-0 rounded-[16px] border-[1.5px] border-primary bg-white [&_input]:scroll-mb-28 [&_select]:scroll-mb-28 [&_textarea]:scroll-mb-28 lg:[&_input]:scroll-mb-4 lg:[&_textarea]:scroll-mb-4"
      >
        <input type="hidden" name="student_id" value={lead.id} />
        <input type="hidden" name="branch_id" value={lead.branch_id} />
        <input type="hidden" name="request_id" value={nonce} />
        <fieldset disabled={pending} className="min-w-0 space-y-6 p-4 sm:p-5">
          <div>
            <h2 id="lead-name" className="break-words text-[22px] font-bold leading-tight tracking-[-0.02em] text-navy">
              {savedName}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {lead.pipeline_stage} · {branch.name} · times in IST
            </p>
          </div>

          <Step n={1} title="Call and review details">
            <a
              href={`tel:+91${lead.student_phone}`}
              className="num flex min-h-[54px] items-center justify-center gap-2.5 rounded-[14px] bg-primary px-4 text-[17px] font-bold text-white hover:bg-primary-hover"
            >
              <Phone size={20} aria-hidden="true" /> Call {displayPhone(lead.student_phone)}
            </a>
            {scheduledVisit && !invited && (
              <p className="rounded-xl bg-info-bg px-3 py-2 text-sm text-info">
                Visit booked · {dateTime(scheduledVisit.scheduled_at)}
              </p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl bg-[#FBF9F4] p-3.5 text-sm">
              {summary.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="break-words font-semibold">{value || <span className="font-normal text-muted">—</span>}</dd>
                </div>
              ))}
            </dl>
            <details className="rounded-xl border border-line">
              <summary className="flex min-h-11 items-center justify-between gap-3 px-3.5 text-sm font-semibold text-navy">
                <span>Previous calls{calls.length ? ` (${calls.length}${hasMore ? "+" : ""})` : ""}</span>
                <span className="truncate font-normal text-muted">
                  {loading && !calls.length ? "Loading…" : calls[0] ? `Last: ${calls[0].outcome} · ${dateTime(calls[0].created_at)}` : "None yet"}
                </span>
              </summary>
              <div className="max-h-72 space-y-2 overflow-y-auto border-t border-line p-3">
                {calls.map((call) => (
                  <article key={call.id} className="rounded-lg bg-[#FBF9F4] p-3 text-sm">
                    <p className="font-semibold">{call.outcome}</p>
                    <p className="text-xs text-muted">{dateTime(call.created_at)}</p>
                    {call.remarks && <p className="mt-1 whitespace-pre-line text-[#3E4F59]">{call.remarks}</p>}
                    {call.next_callback_at && <p className="mt-1 text-primary">Callback · {dateTime(call.next_callback_at)}</p>}
                  </article>
                ))}
                {historyError && <p role="alert" className="text-sm text-danger-text">{historyError}</p>}
                {!loading && !calls.length && !historyError && <p className="text-sm text-muted">No calls logged yet.</p>}
                {hasMore && (
                  <Button type="button" variant="neutral" size="sm" onClick={loadMore} disabled={loading}>
                    Load earlier calls
                  </Button>
                )}
              </div>
            </details>
            <details className="rounded-xl border border-line">
              <summary className="flex min-h-11 items-center px-3.5 text-sm font-semibold text-primary">Edit student &amp; education details</summary>
              <div className="space-y-4 border-t border-line p-3.5">
                <Field label="Full name" name="full_name" value={education.full_name} onChange={(event) => setEducation((old) => ({ ...old, full_name: event.target.value }))} required />
                <ParentPhoneField
                  value={education.parent_phone}
                  onChange={(event) => setEducation((old) => ({ ...old, parent_phone: event.target.value }))}
                  studentId={lead.id}
                  branchId={lead.branch_id}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["city", "City"],
                    ["state", "State"],
                    ["academic_stream", "Academic stream"],
                    ["percentage_or_score", "Percentage or score"],
                    ["target_course", "Target course"],
                    ["preferred_locations", "Preferred locations"],
                    ["budget_range", "Budget range"],
                  ].map(([name, label]) => (
                    <Field key={name} label={label} name={name} value={education[name as keyof typeof education]} onChange={(event) => setEducation((old) => ({ ...old, [name]: event.target.value }))} />
                  ))}
                </div>
                <Button type="submit" name="intent" value="details" formNoValidate variant="outline">
                  Save education details
                </Button>
              </div>
            </details>
          </Step>

          <Step n={2} title="Choose the outcome">
            <fieldset className="min-w-0 space-y-2">
              <legend className="sr-only">Call outcome</legend>
              {OUTCOMES.map(([value, label]) => (
                <label
                  key={value}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] px-3.5 text-[15px] ${outcome === value ? "border-primary bg-teal-soft font-bold text-navy" : "border-line bg-white"}`}
                >
                  <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} required className="size-5 accent-primary" />
                  {label}
                </label>
              ))}
            </fieldset>
          </Step>

          {outcome && (
            <Step n={3} title="Set the next action">
              {outcome === "invite" && <Field label="Visit date & time · IST" name="scheduled_at" type="datetime-local" required />}
              {(outcome === "callback" || outcome === "no_answer") && <Field label="Next callback date & time · IST" name="next_call_at" type="datetime-local" required />}
              {outcome === "dropped" && <Field label="Drop reason" name="drop_reason" maxLength={1000} placeholder="e.g. Chose a local college" required />}
            </Step>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-ink">
              Internal call remarks <span className="font-normal text-muted">· not visible to the student</span>
            </span>
            <textarea
              name="remarks"
              rows={3}
              maxLength={3000}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              className="w-full rounded-[10px] border-[1.5px] border-input-line p-3 text-base focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_#BFE3DC] focus-visible:outline-none"
            />
          </label>
        </fieldset>

        <div aria-live="polite" className="space-y-2 px-4 empty:hidden sm:px-5">
          {state.error && !pending && (
            <p role="alert" className="rounded-xl border border-[#F4C7C1] bg-danger-bg p-3 text-sm text-danger-text">
              {state.error} Your notes are still here.
            </p>
          )}
          {state.success && !pending && (
            <p role="status" className="rounded-xl bg-success-bg p-3 text-sm text-success">
              {state.success}
            </p>
          )}
          {state.parent_phone_shared && <p className="text-sm text-marigold-text">This parent number is already used in this branch. The student was saved.</p>}
        </div>
        {invited && scheduledVisit && (
          <div className="mx-4 mt-3 space-y-2 rounded-xl border border-[#9CC9C1] bg-teal-soft p-3.5 sm:mx-5">
            <p className="text-sm font-semibold text-navy">Visit · {dateTime(scheduledVisit.scheduled_at)}</p>
            <Button asChild className="w-full sm:w-auto">
              <a href={inviteUrl(lead.student_phone, savedName, scheduledVisit.scheduled_at, branch)} target="_blank" rel="noreferrer">
                Send invite on WhatsApp
              </a>
            </Button>
          </div>
        )}
        {state.success && (
          <p className="px-4 pt-2 text-sm text-muted sm:px-5">
            <Link href={backHref} className="font-semibold text-primary">Back to queue</Link> to see the updated list.
          </p>
        )}
        <div className="sticky bottom-0 z-10 mt-4 rounded-b-[14px] border-t border-line bg-white p-3 shadow-[0_-4px_16px_rgba(16,47,64,.08)] lg:static lg:shadow-none sm:px-5">
          <Button type="submit" name="intent" value="outcome" disabled={pending} aria-busy={pending} className="h-[54px] w-full rounded-[14px] text-base font-bold lg:w-auto lg:px-8">
            {pending ? "Saving…" : "Save call outcome"}
          </Button>
        </div>
      </form>
    </section>
  );
}
