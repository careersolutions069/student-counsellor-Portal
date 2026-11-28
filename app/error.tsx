"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-bold">
        This page is temporarily unavailable
      </h1>
      <p className="my-4">
        Something went wrong while loading this page. Check your internet connection and try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
