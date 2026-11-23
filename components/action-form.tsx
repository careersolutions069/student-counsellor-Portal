"use client";
import { LoaderCircle } from "lucide-react";
import { useUploadAction } from "@/components/use-upload-action";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/app/actions";
export function ActionForm({
  action,
  children,
  submit,
  variant = "default",
  className = "",
  disabled = false,
  note,
  noteId,
  hideSubmit = false,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  /** Render-prop form receives the pending state (used by FileRow to show Uploading…). */
  children?: React.ReactNode | ((pending: boolean) => React.ReactNode);
  submit: string;
  variant?: "default" | "outline";
  className?: string;
  disabled?: boolean;
  /** Short explanation shown beside the submit button, e.g. what is still required. */
  note?: React.ReactNode;
  noteId?: string;
  /** For forms that submit themselves (FileRow in submit mode). */
  hideSubmit?: boolean;
}) {
  const [state, formAction, pending, onSubmit] = useUploadAction<ActionState>(
    async (previous: ActionState, form: FormData) => {
      for (const key of ["scheduled_at", "next_callback_at"]) {
        const value = form.get(key);
        if (typeof value === "string" && value)
          form.set(key, `${value}:00+05:30`);
      }
      return action(previous, form);
    },
    {},
  );
  return (
    <form action={formAction} onSubmit={onSubmit} aria-busy={pending} className={`space-y-4 ${className}`}>
      <fieldset disabled={pending} className="contents">
        {typeof children === "function" ? children(pending) : children}
      </fieldset>
      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-[#F4C7C1] bg-danger-bg p-3 text-sm text-danger-text"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="rounded-xl bg-success-bg p-3 text-sm text-success"
        >
          {state.success}
        </p>
      )}
      {!hideSubmit && <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" variant={variant} disabled={pending || disabled} aria-busy={pending} aria-describedby={note ? noteId : undefined}>
          {pending && <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {pending ? "Please wait…" : submit}
        </Button>
        {note && <p id={noteId} className="min-w-0 flex-1 basis-56 text-sm text-[#3E4F59]">{note}</p>}
      </div>}
    </form>
  );
}
