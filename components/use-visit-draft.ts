'use client';
import {useEffect, useRef, useState, type ChangeEvent} from 'react';
import {saveVisitDraft} from '@/app/visits/actions';
import type {VisitDraft, VisitDraftFields} from '@/lib/visit-conversion';

export function useVisitDraft(id: string, branch: string, initial?: VisitDraft | null) {
  const fields = useRef(initial?.fields ?? {});
  const saved = useRef(fields.current);
  const version = useRef(initial?.version ?? null);
  const attempt = useRef<{fields: VisitDraftFields; next: string} | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState(Object.keys(fields.current).length ? 'Draft saved' : '');
  const [error, setError] = useState('');

  async function drain() {
    while (saved.current !== fields.current) {
      // Reuse the request identity when a successful write loses its response.
      const request = attempt.current ?? {fields: fields.current, next: crypto.randomUUID()};
      attempt.current = request;
      try {
        const result = await saveVisitDraft(id, branch, version.current, request.next, request.fields);
        if (result.error) throw new Error(result.error);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : 'Check your connection and retry.');
        setStatus('Draft has unsaved changes');
        return false;
      }
      version.current = request.next;
      saved.current = request.fields;
      attempt.current = null;
    }
    setStatus('Draft saved');
    setError('');
    return true;
  }

  function flush(): Promise<boolean> {
    clearTimeout(timer.current);
    if (running.current) return running.current;
    if (saved.current === fields.current) return Promise.resolve(true);
    setStatus('Saving draft…');
    running.current = drain().finally(() => { running.current = null; });
    return running.current;
  }

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (saved.current !== fields.current) event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      void flush();
    };
    // The visit editor is keyed by student and branch.
  }, [id, branch]);

  function change(event: ChangeEvent<HTMLFormElement>) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type === 'file' || !input.name) return;
    const value = input.name === 'selected_courses'
      ? new FormData(event.currentTarget).getAll(input.name).map(String)
      : input.value;
    fields.current = {...fields.current, [input.name]: value};
    setError('');
    setStatus('Saving draft…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 650);
  }

  function completed(next: string) {
    version.current = next;
    fields.current = {};
    saved.current = fields.current;
    setError('');
    setStatus('');
  }
  return {status, error, version, change, flush, completed};
}
