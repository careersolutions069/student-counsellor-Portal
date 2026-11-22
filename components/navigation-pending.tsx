"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";

export function NavigationPending() {
  const { pending } = useLinkStatus();
  return (
    <span role="status" className="ml-auto shrink-0">
      {pending && (
        <>
          <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span className="sr-only">Loading page</span>
        </>
      )}
    </span>
  );
}
