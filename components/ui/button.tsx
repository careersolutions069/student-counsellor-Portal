import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "bg-primary text-white hover:bg-primary-hover",
        outline:
          "border-[1.5px] border-primary bg-white text-primary hover:bg-teal-soft",
        neutral:
          "border-[1.5px] border-input-line bg-white text-navy hover:bg-teal-soft",
        onNavy: "on-navy bg-white font-bold text-navy hover:bg-ivory",
        navyOutline:
          "on-navy border border-[#456879] text-white hover:bg-navy-2",
        warningOutline:
          "border-[1.5px] border-warning bg-white text-warning hover:bg-warning-bg",
        ghost: "text-muted hover:bg-teal-soft hover:text-navy",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        sm: "min-h-10 px-3.5 py-1.5",
        lg: "min-h-12 px-5 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
