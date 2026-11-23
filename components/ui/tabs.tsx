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
      className={cn("grid grid-cols-2 gap-1 rounded-xl bg-sand p-1", className)}
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
        "min-h-11 rounded-[9px] px-3 text-[15px] font-semibold text-[#4A5A64] transition-colors hover:text-navy data-[state=active]:bg-white data-[state=active]:font-bold data-[state=active]:text-navy data-[state=active]:shadow-[0_1px_2px_rgba(16,47,64,.12),0_0_0_1px_#D7CFBF]",
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
      className={cn("mt-6", className)}
      {...props}
    />
  );
}
