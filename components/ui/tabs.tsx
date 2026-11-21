"use client";
import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
export const Tabs = TabsPrimitive.Root;
export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("grid grid-cols-2 rounded-lg bg-slate-100 p-1", className)}
      {...props}
    />
  );
}
export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "rounded-md px-3 py-2.5 text-sm font-semibold text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-teal-600 data-[state=active]:bg-white data-[state=active]:text-teal-900 data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-7 outline-none", className)}
      {...props}
    />
  );
}
