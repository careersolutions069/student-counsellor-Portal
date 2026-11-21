'use client';
import { useId, useState, type ComponentProps } from 'react';
import { Field } from '@/components/fields';
import { uploadSizeError } from '@/lib/upload-limits';
export function UploadField({onChange, ...props}: ComponentProps<typeof Field>) {
  const [error, setError] = useState('');
  const errorId = useId();
  return <div>
    <Field {...props} type="file" aria-describedby={[props['aria-describedby'], error ? errorId : ''].filter(Boolean).join(' ') || undefined} onChange={event => {
      const message = uploadSizeError(event.currentTarget.files?.[0]);
      event.currentTarget.setCustomValidity(message);
      setError(message);
      onChange?.(event);
    }}/>
    {error && <p id={errorId} role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
  </div>;
}
