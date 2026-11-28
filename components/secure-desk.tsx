"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Phone, PhoneCall, MessageCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/fields";
import { dateTime } from "@/lib/utils";
import {
  ACTIVE_ATTEMPT,
  SECURE_OUTCOMES,
  attemptLabel,
  type Desk,
  type DeskAttempt,
} from "@/lib/secure-calling";
import { attemptStatus, saveSecureOutcome, sendVisitInvite, simulateCall, startCall, type SecureResult } from "@/app/counsellor/secure-actions";

const REASON = { new: "New lead", callback: "Callback due", missed: "Missed visit · re-invite" } as const;

/** A datetime-local value in IST, two hours from now, for quick "try again later". */
function inTwoHours() {
  const ist = new Date(Date.now() + 2 * 3600 * 1000 + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 16);
}

function Progress({ desk }: { desk: Desk }) {
  const { today, target } = desk;
  const percent = Math.min(100, Math.round((today.attempts / Math.max(1, target)) * 100));
  return (
    <section aria-labelledby="today-title" className="panel space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-title" className="section-title">Today</h2>
        <p className="num text-sm text-muted">
          <strong className="text-lg text-navy">{today.attempts}</strong> of {target} calls
        </p>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-label="Calls made today" aria-valuemin={0} aria-valuemax={target} aria-valuenow={today.attempts}>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          ["Answered", today.answered],
          ["Conversations", today.conversations],
          ["Visits booked", today.visits_booked],
          ["Callbacks due", desk.callbacks_due],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[#FBF9F4] px-3 py-2">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="num text-lg font-bold text-navy">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">A call counts once the company line dials the student. Conversations are answered calls of a minute or more.</p>
    </section>
  );
}

export function SecureDesk({ desk, callerName, connected, testMode }: { desk: Desk; callerName: string; connected: boolean; testMode: boolean }) {
  const router = useRouter();
  const lead = desk.lead;
  const [attempt, setAttempt] = useState<DeskAttempt | null>(lead?.attempt ?? null);
  const [callError, setCallError] = useState("");
  const [calling, startCalling] = useTransition();
  const [outcome, setOutcome] = useState("");
  const [nonce] = useState(() => crypto.randomUUID());
  const [invite, setInvite] = useState<{ text?: string; ok?: boolean }>({});
  const [inviting, startInviting] = useTransition();
  const [moving, startMoving] = useTransition();
  const locked = useRef(false);
  const active = attempt ? ACTIVE_ATTEMPT.includes(attempt.status) : false;

  // Follow the provider's progress while a call is live.
  useEffect(() => {
    if (!attempt || !active) return;
    const timer = setInterval(async () => {
      const result = await attemptStatus(attempt.id).catch(() => null);
      if (result?.attempt) setAttempt(result.attempt);
    }, 2000);
    return () => clearInterval(timer);
  }, [attempt, active]);
  useEffect(() => {
    if (!outcome && attempt && (attempt.status === "busy" || attempt.status === "no_answer")) setOutcome("no_answer");
  }, [attempt, outcome]);

  const [state, action, pending] = useActionState(async (previous: SecureResult, form: FormData): Promise<SecureResult> => {
    for (const name of ["scheduled_at", "next_call_at"]) {
      const value = form.get(name);
      if (typeof value === "string" && value) form.set(name, `${value}:00+05:30`);
    }
    try {
      const result = await saveSecureOutcome(previous, form);
      // Move straight on, unless there is something to confirm or send first.
      if (result.saved && result.saved.outcome !== "invite" && !result.saved.parent_updated) startMoving(() => router.refresh());
      return result;
    } catch {
      return { error: "We couldn’t reach the server, so nothing was saved. Check your connection and try again." };
    } finally {
      locked.current = false;
    }
  }, {});

  function call(contact: "student" | "parent") {
    if (!lead) return;
    setCallError("");
    startCalling(async () => {
      const result = await startCall(lead.id, contact).catch(() => ({ error: "We couldn’t reach the server. Try again.", attempt: undefined }));
      if (result.attempt) setAttempt(result.attempt);
      if (result.error) setCallError(result.error);
    });
  }
  function simulate(result: "answered" | "busy" | "no_answer") {
    if (!attempt) return;
    startCalling(async () => {
      const next = await simulateCall(attempt.id, result);
      if (next.attempt) setAttempt(next.attempt);
      if (next.error) setCallError(next.error);
    });
  }

  // Faint repeated caller name behind the desk, so a photo or screenshot carries who took it.
  const label = callerName.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="150"><text x="20" y="90" transform="rotate(-15 140 75)" font-family="sans-serif" font-size="18" font-weight="700" fill="#102F40">${label}</text></svg>`;
  const watermark = (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.06]"
      style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(tile)}")` }}
    />
  );

  const saved = state.saved;
  const booked = saved?.outcome === "invite" ? saved.appointment : null;
  const paused = Boolean(saved && (booked || saved.parent_updated));

  return (
    <div className="relative space-y-4">
      {watermark}
      <div className="relative z-[1] space-y-4">
        <Progress desk={desk} />
        {!connected && (
          <p role="status" className="rounded-xl border border-[#F2D08C] bg-marigold-50 p-3 text-sm text-marigold-text">
            Company calling is not connected for this branch yet, so calls can’t be placed. Ask your Centre Head.
          </p>
        )}
        {connected && !desk.work_phone_set && (
          <p role="status" className="rounded-xl border border-[#F2D08C] bg-marigold-50 p-3 text-sm text-marigold-text">
            Ask your Centre Head to add your work phone. The company line rings it before connecting each student.
          </p>
        )}

        {!lead ? (
          <section className="panel space-y-2">
            <h2 className="section-title">No students to call right now</h2>
            <p className="text-muted">New leads appear here when your Centre Head assigns them. Callbacks appear when they are due.</p>
            <Button type="button" variant="outline" onClick={() => startMoving(() => router.refresh())} disabled={moving}>
              {moving && <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              Check again
            </Button>
          </section>
        ) : paused ? (
          <section className="panel space-y-3" aria-live="polite">
            <h2 className="section-title">{booked ? `Visit booked for ${lead.first_name}` : `Saved for ${lead.first_name}`}</h2>
            {booked && <p className="text-sm">{dateTime(booked.scheduled_at)} IST</p>}
            {saved?.parent_updated && <p role="status" className="text-sm text-success">Parent contact updated.</p>}
            <div className="flex flex-wrap gap-2">
              {booked && <Button
                type="button"
                disabled={inviting || invite.ok}
                onClick={() =>
                  startInviting(async () => {
                    const result = await sendVisitInvite(booked!.id).catch(() => ({ error: "We couldn’t reach the server. Try again.", success: undefined }));
                    setInvite(result.success ? { text: result.success, ok: true } : { text: result.error, ok: false });
                  })
                }
              >
                {inviting ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <MessageCircle size={16} aria-hidden="true" />}
                {invite.ok ? "Invite sent" : "Send visit invite on WhatsApp"}
              </Button>}
              <Button type="button" variant="outline" onClick={() => startMoving(() => router.refresh())} disabled={moving}>
                Next student <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
            {invite.text && (
              <p role={invite.ok ? "status" : "alert"} className={`text-sm ${invite.ok ? "text-success" : "text-danger-text"}`}>
                {invite.text}
              </p>
            )}
            {booked && <p className="text-xs text-muted">The invite goes from the company WhatsApp account. Your phone is not used.</p>}
          </section>
        ) : (
          <form
            action={action}
            onSubmit={(event) => {
              if (locked.current) event.preventDefault();
              else locked.current = true;
            }}
            onReset={(event) => event.preventDefault()}
            className="min-w-0 rounded-[16px] border-[1.5px] border-primary bg-white"
            aria-labelledby="lead-name"
          >
            <input type="hidden" name="student_id" value={lead.id} />
            <input type="hidden" name="request_id" value={nonce} />
            <fieldset disabled={pending || moving} className="min-w-0 space-y-6 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="lead-name" className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-navy">{lead.first_name}</h2>
                  <p className="mt-1 text-sm text-muted">{[lead.pipeline_stage, lead.lead_source].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="rounded-full bg-teal-soft px-2.5 py-1 text-xs font-bold text-[#0B5650]">{REASON[lead.reason]}</span>
              </div>

              <section aria-labelledby="step-call" className="space-y-3">
                <h3 id="step-call" className="text-xs font-bold uppercase tracking-[0.05em] text-muted">1 · Call</h3>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" onClick={() => call("student")} disabled={!connected || !desk.work_phone_set || calling || active} className="h-[54px] rounded-[14px] text-base font-bold sm:flex-1">
                    {calling ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Phone size={18} aria-hidden="true" />}
                    Call {lead.first_name}
                  </Button>
                  {lead.has_parent_phone && (
                    <Button type="button" variant="outline" onClick={() => call("parent")} disabled={!connected || !desk.work_phone_set || calling || active} className="h-[54px] rounded-[14px] text-base sm:flex-1">
                      <PhoneCall size={18} aria-hidden="true" /> Call parent
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted">The company line rings your work phone, then connects you. The student’s number is never shown.</p>
                <div aria-live="polite" className="empty:hidden">
                  {attempt && <p className="rounded-xl bg-info-bg px-3 py-2 text-sm text-info">{attemptLabel(attempt)}</p>}
                  {callError && <p role="alert" className="mt-2 text-sm text-danger-text">{callError}</p>}
                </div>
                {testMode && attempt && active && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-2.5">
                    <span className="text-xs font-semibold text-muted">Test provider:</span>
                    <Button type="button" size="sm" variant="neutral" onClick={() => simulate("answered")}>Answered 1 min 35 s</Button>
                    <Button type="button" size="sm" variant="neutral" onClick={() => simulate("busy")}>Busy</Button>
                    <Button type="button" size="sm" variant="neutral" onClick={() => simulate("no_answer")}>No answer</Button>
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl bg-[#FBF9F4] p-3.5 text-sm">
                  {[
                    ["Course interest", lead.target_course],
                    ["Marks", lead.percentage_or_score],
                    ["Stream", lead.academic_stream],
                    ["City", [lead.city, lead.state].filter(Boolean).join(", ")],
                    ["Preferred locations", lead.preferred_locations],
                    ["Budget", lead.budget_range],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="break-words font-semibold">{value || <span className="font-normal text-muted">—</span>}</dd>
                    </div>
                  ))}
                </dl>
                {lead.latest_appointment && (
                  <p className="text-sm text-muted">
                    Last visit: {lead.latest_appointment.status} · {dateTime(lead.latest_appointment.scheduled_at)}
                  </p>
                )}
                {lead.calls.length > 0 && (
                  <details className="rounded-xl border border-line">
                    <summary className="flex min-h-11 items-center justify-between gap-3 px-3.5 text-sm font-semibold text-navy">
                      <span>Previous calls ({lead.calls.length})</span>
                      <span className="truncate font-normal text-muted">Last: {lead.calls[0].outcome}</span>
                    </summary>
                    <div className="space-y-2 border-t border-line p-3">
                      {lead.calls.map((c) => (
                        <article key={c.id} className="rounded-lg bg-[#FBF9F4] p-3 text-sm">
                          <p className="font-semibold">{c.outcome}</p>
                          <p className="text-xs text-muted">{dateTime(c.created_at)}</p>
                          {c.remarks && <p className="mt-1 whitespace-pre-line text-[#3E4F59]">{c.remarks}</p>}
                        </article>
                      ))}
                    </div>
                  </details>
                )}
              </section>

              <section aria-labelledby="step-outcome" className="space-y-3">
                <h3 id="step-outcome" className="text-xs font-bold uppercase tracking-[0.05em] text-muted">2 · Outcome</h3>
                <fieldset className="grid min-w-0 gap-2 sm:grid-cols-2">
                  <legend className="sr-only">Call outcome</legend>
                  {SECURE_OUTCOMES.map(([value, label]) => (
                    <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] px-3.5 text-[15px] ${outcome === value ? "border-primary bg-teal-soft font-bold text-navy" : "border-line bg-white"}`}>
                      <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} required className="size-5 accent-primary" />
                      {label}
                    </label>
                  ))}
                </fieldset>
                {outcome === "invite" && <Field label="Visit date & time · IST" name="scheduled_at" type="datetime-local" required />}
                {(outcome === "callback" || outcome === "no_answer") && (
                  <Field key={outcome} label="Call again at · IST" name="next_call_at" type="datetime-local" defaultValue={outcome === "no_answer" ? inTwoHours() : undefined} required />
                )}
                {outcome === "dropped" && <Field label="Why not interested" name="drop_reason" maxLength={1000} placeholder="e.g. Chose a local college" required />}
                {outcome === "do_not_contact" && <p className="text-sm text-muted">This student will not be called again, even if the lead is reassigned or imported again.</p>}
                {outcome === "wrong_number" && <p className="text-sm text-muted">The lead goes to your Centre Head to check the number.</p>}
              </section>

              <details className="rounded-xl border border-line">
                <summary className="flex min-h-11 items-center px-3.5 text-sm font-semibold text-primary">Update course details or parent contact</summary>
                <div className="space-y-4 border-t border-line p-3.5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        ["target_course", "Course interest"],
                        ["percentage_or_score", "Percentage or score"],
                        ["academic_stream", "Academic stream"],
                        ["preferred_locations", "Preferred locations"],
                        ["budget_range", "Budget range"],
                        ["city", "City"],
                        ["state", "State"],
                      ] as const
                    ).map(([name, label]) => (
                      <Field key={name} label={label} name={name} defaultValue={lead[name] || ""} />
                    ))}
                  </div>
                  <Field label="Add or correct parent number" name="parent_phone" type="tel" inputMode="numeric" autoComplete="off" placeholder="10-digit mobile number" />
                  <p className="-mt-2 text-xs text-muted">Leave blank to keep the saved number. Saved numbers are not shown here.</p>
                </div>
              </details>

              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-ink">
                  Call notes <span className="font-normal text-muted">· not visible to the student</span>
                </span>
                <textarea name="remarks" rows={3} maxLength={3000} className="w-full rounded-[10px] border-[1.5px] border-input-line p-3 text-base focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_#BFE3DC] focus-visible:outline-none" />
              </label>
            </fieldset>
            <div aria-live="polite" className="space-y-2 px-4 empty:hidden sm:px-5">
              {state.error && !pending && (
                <p role="alert" className="rounded-xl border border-[#F4C7C1] bg-danger-bg p-3 text-sm text-danger-text">
                  {state.error} Your notes are still here.
                </p>
              )}
              {saved && (
                <p role="status" className="rounded-xl bg-success-bg p-3 text-sm text-success">
                  Saved.{saved.parent_updated ? " Parent contact updated." : ""} Loading the next student…
                </p>
              )}
            </div>
            <div className="sticky bottom-0 z-10 mt-4 rounded-b-[14px] border-t border-line bg-white p-3 shadow-[0_-4px_16px_rgba(16,47,64,.08)] sm:px-5 lg:static lg:shadow-none">
              <Button type="submit" disabled={pending || moving || !attempt} aria-busy={pending} className="h-[54px] w-full rounded-[14px] text-base font-bold lg:w-auto lg:px-8">
                {pending || moving ? "Saving…" : "Save and call next student"}
              </Button>
              {!attempt && <p className="mt-2 text-xs text-muted">Place the call first. Then save the outcome.</p>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
