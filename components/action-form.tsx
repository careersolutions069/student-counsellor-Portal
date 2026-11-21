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
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  submit: string;
  variant?: "default" | "outline";
  className?: string;
  disabled?: boolean;
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
        {children}
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
      <Button type="submit" variant={variant} disabled={pending || disabled} aria-busy={pending}>
        {pending && <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {pending ? "Please wait…" : submit}
      </Button>
    </form>
  );
}
