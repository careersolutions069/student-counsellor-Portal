"use client";
import { useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { Menu, X } from "lucide-react";
import { NavigationPending } from "@/components/navigation-pending";
import { BrandMark } from "@/components/brand";
export type NavItem = { href: string; label: string; current: boolean };
export function NavList({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      <li className="flex min-h-11 items-center px-3 text-[15px] font-semibold text-[#DCE9EC]">
        Dashboard
      </li>
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={item.current ? "page" : undefined}
            className={
              item.current
                ? "flex min-h-11 items-center gap-2.5 rounded-[10px] bg-ivory px-3 text-[15px] font-bold text-navy"
                : "flex min-h-11 items-center rounded-[10px] py-2 pl-[26px] pr-3 text-[15px] text-[#DCE9EC] transition-colors hover:bg-navy-2 hover:text-white"
            }
          >
            {item.current && (
              <span
                aria-hidden="true"
                className="h-[18px] w-1 shrink-0 rounded-sm bg-marigold"
              />
            )}
            <span className="min-w-0 flex-1">{item.label}</span>
            <NavigationPending />
          </Link>
        </li>
      ))}
    </ul>
  );
}
export function MobileNav({
  items,
  scope,
  roleLabel,
  footer,
}: {
  items: NavItem[];
  scope?: string;
  roleLabel: string;
  footer: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="-ml-2 flex size-11 items-center justify-center rounded-[10px] text-white hover:bg-navy-2"
        >
          <Menu size={22} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(16,47,64,.55)]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="on-navy fixed inset-y-0 left-0 z-50 flex w-[316px] max-w-[85vw] flex-col gap-4 overflow-y-auto bg-navy px-3.5 pb-5 pt-3 text-white"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2.5 text-base font-bold">
              <BrandMark size={28} />
              Career Solution
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="flex size-11 items-center justify-center rounded-[10px] hover:bg-navy-2"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <div className="rounded-xl bg-navy-2 px-3 py-2.5">
            <span className="block text-xs text-[#B9D4D9]">{roleLabel}</span>
            <strong>{scope || "All India"}</strong>
          </div>
          {items.length > 0 && (
            <nav aria-label="Main navigation">
              <NavList items={items} onNavigate={() => setOpen(false)} />
            </nav>
          )}
          <div className="mt-auto">{footer}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
