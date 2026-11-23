"use client";
import { useActionState, useRef } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { markAppointment, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
const LABEL: Record<string, string> = { attended: "Attended", missed: "Missed" };
/** Mark Attended / Mark Missed with a visible saving state, the saved result, and a retry hint on failure. */
export function AttendanceActions({
  appointmentId,
  status,
}: {
  appointmentId: string;
  status: string;
}) {
  const choice = useRef("");
  // Blocks a second submit before React re-renders the disabled button (double-click).
  const locked = useRef(false);
  const [state, action, pending] = useActionState(
    async (previous: ActionState, form: FormData): Promise<ActionState> => {
      choice.current = String(form.get("status"));
      let result: ActionState;
      try {
        result = await markAppointment(previous, form);
      } catch {
        result = { error: "We couldn’t reach the server." };
      } finally {
        locked.current = false;
      }
      return result.success
        ? { success: `Saved. Visit marked ${LABEL[choice.current]}.` }
        : {
            error: `Attendance was not saved. ${result.error || ""} Check your connection, then select ${status === "scheduled" ? "Mark" : "Change to"} ${LABEL[choice.current]} again.`.trim(),
          };
    },
    {},
  );
  const current = status === "completed" ? "attended" : status;
  const scheduled = current === "scheduled";
  const button = (value: "attended" | "missed", primary: boolean) => (
    <Button
      type="submit"
      name="status"
      value={value}
      variant={primary ? (value === "attended" ? "default" : "warningOutline") : "neutral"}
      size={primary ? "lg" : "sm"}
      disabled={pending}
      onClick={() => {
        choice.current = value;
      }}
      aria-busy={pending && choice.current === value}
      className={primary ? "rounded-xl" : ""}
    >
      {pending && choice.current === value ? (
        <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : value === "attended" && primary ? (
        <Check size={18} aria-hidden="true" />
      ) : null}
      {pending && choice.current === value
        ? "Saving…"
        : primary
          ? `Mark ${LABEL[value]}`
          : `Change to ${LABEL[value]}`}
    </Button>
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (locked.current) event.preventDefault();
        else locked.current = true;
      }}
      className="space-y-2"
      aria-label="Visit attendance"
    >
      <input type="hidden" name="id" value={appointmentId} />
      {scheduled ? (
        <div className="flex flex-wrap gap-2">
          {button("attended", true)}
          {button("missed", true)}
        </div>
      ) : (
        ["attended", "missed"].includes(current) && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>Wrong attendance?</span>
            {button(current === "attended" ? "missed" : "attended", false)}
          </div>
        )
      )}
      <div aria-live="polite">
        {state.success && !pending && (
          <p role="status" className="rounded-xl bg-success-bg px-3 py-2 text-sm text-success">
            {state.success}
          </p>
        )}
        {state.error && !pending && (
          <p role="alert" className="rounded-xl border border-[#F4C7C1] bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
