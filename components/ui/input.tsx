import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-[10px] border-[1.5px] border-input-line bg-white px-3.5 text-base text-ink outline-none placeholder:text-muted/80 focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_#BFE3DC] focus-visible:outline-none disabled:opacity-60 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}
