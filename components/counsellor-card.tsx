"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/fields";
import { ParentPhoneField } from "@/components/parent-phone-field";
import { dateTime } from "@/lib/utils";
import {
  inviteUrl,
  type CallerLead,
  type CallerBranch,
  type CallLog,
} from "@/lib/counsellor";
import {
  recordCallerAction,
  callerHistory,
  type CallerResult,
} from "@/app/counsellor/actions";
function CallDrawer({
  lead,
  branch,
  onSaved,
}: {
  lead: CallerLead;
  branch: CallerBranch;
  onSaved: () => void;
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
  const [nonce, setNonce] = useState(() => crypto.randomUUID());
  const [history, setHistory] = useState<CallLog[]>([]);
  const [added, setAdded] = useState<CallLog[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
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
    async (previous: CallerResult, form: FormData) => {
      for (const name of ["scheduled_at", "next_call_at"]) {
        const value = form.get(name);
        if (typeof value === "string" && value)
          form.set(name, `${value}:00+05:30`);
      }
      const result = await recordCallerAction(previous, form);
      if (result.success) {
        onSaved();
        setAppointment(result.appointment || null);
        setSavedName(result.student_name || education.full_name);
        if (result.call) {
          setAdded((old) =>
            old.some((c) => c.id === result.call!.id)
              ? old
              : [result.call!, ...old],
          );
          setNonce(crypto.randomUUID());
        }
      }
      return result;
    },
    {},
  );
  const visibleHistory = [...added, ...history].filter(
    (call, index, all) => all.findIndex((c) => c.id === call.id) === index,
  );
  async function loadMore() {
    setLoading(true);
    const last = history.at(-1);
    const result = await callerHistory(
      lead.id,
      last ? { created_at: last.created_at, id: last.id } : undefined,
    );
    setHistory((old) => [...old, ...result.calls]);
    setHasMore(result.hasMore);
    setHistoryError(result.error || "");
    setLoading(false);
  }
  return (
    <>
      <form action={action} onReset={(event) => event.preventDefault()} className="space-y-6">
        <input type="hidden" name="student_id" value={lead.id} />
        <input type="hidden" name="branch_id" value={lead.branch_id} />
        <input type="hidden" name="request_id" value={nonce} />
        <fieldset disabled={pending} className="space-y-6">
          <section className="space-y-4">
            <h3 className="font-semibold">Student & education details</h3>
            <Field
              label="Full name"
              name="full_name"
              value={education.full_name}
              onChange={(event) => setEducation((old) => ({...old, full_name: event.target.value}))}
              required
            />
            <ParentPhoneField
              value={education.parent_phone}
              onChange={(event) => setEducation((old) => ({...old, parent_phone: event.target.value}))}
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
                <Field
                  key={name}
                  label={label}
                  name={name}
                  value={education[name as keyof typeof education]}
                  onChange={(event) => setEducation((old) => ({...old, [name]: event.target.value}))}
                />
              ))}
            </div>
            <Button
              type="submit"
              name="intent"
              value="details"
              formNoValidate
              variant="outline"
            >
              Save education details
            </Button>
          </section>
          <section className="space-y-4 border-t border-slate-200 pt-5">
            <h3 className="font-semibold">Call outcome & next step</h3>
            <Select
              label="Call outcome"
              name="outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              required
            >
              <option value="" disabled>
                Select outcome
              </option>
              <option value="invite">Agreed to Meet (Arrange Invite)</option>
              <option value="callback">Call Back Later</option>
              <option value="no_answer">No Answer</option>
              <option value="dropped">Not Interested / Dropped</option>
            </Select>
            {outcome === "invite" && (
              <Field
                label="Visit date & time · IST"
                name="scheduled_at"
                type="datetime-local"
                required
              />
            )}
            {["callback", "no_answer"].includes(outcome) && (
              <Field
                label="Next callback date & time · IST"
                name="next_call_at"
                type="datetime-local"
                required
              />
            )}
            {outcome === "dropped" && (
              <Field
                label="Drop reason"
                name="drop_reason"
                maxLength={1000}
                required
              />
            )}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">
                Internal call remarks
              </span>
              <textarea
                name="remarks"
                rows={3}
                maxLength={3000}
                className="w-full rounded-lg border border-slate-300 p-3 text-base focus-visible:outline-teal-700"
              />
            </label>
            <Button
              type="submit"
              name="intent"
              value="outcome"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save call outcome"}
            </Button>
          </section>
        </fieldset>
        {state.error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {state.error}
          </p>
        )}
        {state.success && (
          <p
            role="status"
            className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900"
          >
            {state.success}
          </p>
        )}
        {state.parent_phone_shared && (
          <p role="status" className="text-sm text-amber-800">
            This parent number is already used in this branch. The student was
            saved successfully.
          </p>
        )}
      </form>
      {appointment?.status === "scheduled" && (
        <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4">
          <p className="mb-3 text-sm font-semibold">
            Visit · {dateTime(appointment.scheduled_at)}
          </p>
          <Button asChild>
            <a
              href={inviteUrl(
                lead.student_phone,
                savedName,
                appointment.scheduled_at,
                branch,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Send Invite on WhatsApp
            </a>
          </Button>
        </div>
      )}
      <section className="mt-7 space-y-3 border-t border-slate-200 pt-5">
        <h3 className="font-semibold">Internal call history</h3>
        {visibleHistory.map((call) => (
          <article
            key={call.id}
            className="rounded-lg border border-slate-200 p-4"
          >
            <p className="text-sm font-semibold">{call.outcome}</p>
            <p className="mt-1 text-xs text-slate-500">
              {dateTime(call.created_at)}
            </p>
            {call.remarks && (
              <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                {call.remarks}
              </p>
            )}
            {call.next_callback_at && (
              <p className="mt-2 text-sm text-teal-800">
                Callback · {dateTime(call.next_callback_at)}
              </p>
            )}
          </article>
        ))}
        {loading && (
          <p role="status" className="text-sm text-slate-500">
            Loading call history…
          </p>
        )}
        {historyError && (
          <p role="alert" className="text-sm text-red-800">
            {historyError}
          </p>
        )}
        {!loading && !visibleHistory.length && !historyError && (
          <p className="text-sm text-slate-500">No calls logged yet.</p>
        )}
        {hasMore && (
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            Load earlier calls
          </Button>
        )}
      </section>
    </>
  );
}
export function CounsellorCard({
  lead,
  branch,
}: {
  lead: CallerLead;
  branch: CallerBranch;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const timing =
    lead.queue === "invited"
      ? lead.latest_appointment?.scheduled_at
      : lead.callback_at || lead.latest_appointment?.scheduled_at;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value && saved) {
          setSaved(false);
          router.refresh();
        }
      }}
    >
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{lead.full_name}</h2>
            <a
              href={`tel:${lead.student_phone}`}
              className="mt-2 inline-flex items-center gap-2 font-semibold text-teal-800"
            >
              <Phone size={17} />
              {lead.student_phone}
              <span className="sr-only"> · Call student</span>
            </a>
          </div>
          <span className="h-fit rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            {lead.pipeline_stage}
          </span>
        </div>
        <div className="my-4 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">
            {lead.queue === "missed"
              ? "Missed visit / follow-up timing"
              : "Timing"}
          </p>
          <p className="mt-1 font-semibold">
            {timing ? dateTime(timing) : "Call now · New enquiry"}
          </p>
        </div>
        <Dialog.Trigger asChild>
          <Button variant="outline" className="w-full">
            Open call details
          </Button>
        </Dialog.Trigger>
        {lead.queue === "invited" && lead.latest_appointment && (
          <Button asChild className="mt-3 w-full">
            <a
              href={inviteUrl(
                lead.student_phone,
                lead.full_name,
                lead.latest_appointment.scheduled_at,
                branch,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Send Invite on WhatsApp
            </a>
          </Button>
        )}
      </article>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/50" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl outline-none sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-2xl font-bold tracking-tight">
                {lead.full_name}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-slate-500">
                {lead.student_phone} · {branch.name} · Times in IST
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close call details">
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          <CallDrawer
            lead={lead}
            branch={branch}
            onSaved={() => setSaved(true)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
