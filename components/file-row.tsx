"use client";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadSizeError } from "@/lib/upload-limits";
function size(bytes: number) {
  // Round up so a file just over the limit never reads as "4.0 MB".
  return bytes >= 1024 * 1024 ? `${(Math.ceil((bytes / 1024 / 1024) * 10) / 10).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}
/** Extensions from an accept list such as ".pdf,.jpg,application/pdf". */
function extensions(accept: string) {
  return accept.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith("."));
}
/**
 * One file per row: label and chosen filename on the left, a single Upload button on the right.
 * mode "submit": choosing a file submits the surrounding form straight away (checklists, counselling PDFs).
 * mode "select": the button only picks the file; a separate action commits it (visit form, lead import).
 * Must be rendered inside the <form> that receives the file.
 */
export function FileRow({
  label,
  name,
  accept,
  hint,
  mode,
  busy = false,
  current,
  trailing,
  leading,
  inputRef,
  onFile,
  error: externalError,
  readyText = "ready to save",
}: {
  label: string;
  name: string;
  accept: string;
  hint: string;
  mode: "submit" | "select";
  busy?: boolean;
  current?: { name: string; href?: string } | null;
  trailing?: ReactNode;
  leading?: ReactNode;
  inputRef?: RefObject<HTMLInputElement | null>;
  onFile?: (file: File | null) => void;
  error?: string;
  /** Select mode: what happens next, shown after the chosen filename. */
  readyText?: string;
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const input = inputRef || ownRef;
  const [chosen, setChosen] = useState<File | null>(null);
  const [error, setError] = useState("");
  const id = useId();
  const allowed = extensions(accept);
  const shownError = error || externalError;
  // In submit mode the form reports the outcome; clear the picked file once the upload finishes so the row shows the saved file.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy && mode === "submit") {
      setChosen(null);
      if (input.current) input.current.value = "";
    }
    wasBusy.current = busy;
  }, [busy, mode, input]);
  function choose(file: File | undefined) {
    setError("");
    if (!file) {
      setChosen(null);
      onFile?.(null);
      return;
    }
    const ext = `.${file.name.split(".").at(-1)?.toLowerCase()}`;
    const problem = !file.size
      ? `“${file.name}” is empty. Choose another file.`
      : uploadSizeError(file)
        ? `“${file.name}” is ${size(file.size)}. Files must be 4 MB or smaller.`
        : allowed.length && !allowed.includes(ext)
          ? `“${file.name}” can’t be uploaded. Use ${allowed.map((a) => a.slice(1).toUpperCase()).join(", ")}.`
          : "";
    if (problem) {
      setError(problem);
      setChosen(null);
      if (input.current) input.current.value = "";
      onFile?.(null);
      return;
    }
    setChosen(file);
    onFile?.(file);
    if (mode === "submit") input.current?.form?.requestSubmit();
  }
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        {leading ?? <p className="font-semibold text-ink">{label}</p>}
        <p id={`${id}-file`} className="break-words text-sm text-[#3E4F59]" aria-live="polite">
          {chosen ? (
            <>
              <span className="break-all font-semibold text-navy">{chosen.name}</span> · {size(chosen.size)}
              {mode === "select" && <span className="text-muted"> · {readyText}</span>}
            </>
          ) : current ? (
            <>Current file: <span className="break-all font-medium">{current.name}</span></>
          ) : (
            <span className="text-muted">No file chosen</span>
          )}
        </p>
        {current && <p className="text-[13px] text-muted">Uploading a new file replaces the current one.</p>}
        <p id={`${id}-hint`} className="text-[13px] text-muted">{hint}</p>
        {shownError && (
          <p role="alert" className="pt-1 text-sm text-danger-text">
            {shownError}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
        {current?.href && (
          <Button asChild variant="neutral" size="sm" className="min-h-11 lg:min-h-10">
            <a href={current.href} target="_blank" rel="noreferrer">
              View file<span className="sr-only">: {label}</span>
            </a>
          </Button>
        )}
        {trailing}
        <Button
          type="button"
          size="sm"
          disabled={busy}
          aria-busy={busy}
          aria-label={busy ? `Uploading ${label}` : `Upload ${label}`}
          aria-describedby={`${id}-file ${id}-hint`}
          onClick={() => input.current?.click()}
          className="min-h-11 min-w-[104px] lg:min-h-10"
        >
          {busy ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        name={name}
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => choose(event.currentTarget.files?.[0])}
      />
    </div>
  );
}
