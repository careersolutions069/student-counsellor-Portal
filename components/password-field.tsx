"use client";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
export function PasswordField({
  label,
  name,
}: {
  label: string;
  name: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          required
          className="h-[52px] pr-20"
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
          className="absolute right-1 top-1 h-11 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-teal-soft"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
