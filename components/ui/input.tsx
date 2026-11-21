import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base shadow-xs outline-none focus-visible:border-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700/20 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
