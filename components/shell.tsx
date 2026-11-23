import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";
import { MobileNav, NavList, type NavItem } from "@/components/staff-nav";
import { cn } from "@/lib/utils";
export type { NavItem };
function SignOut({ className = "" }: { className?: string }) {
  return (
    <form action={logout}>
      <button
        type="submit"
        className={cn(
          "min-h-11 font-semibold text-marigold-soft underline-offset-4 hover:underline",
          className,
        )}
      >
        Sign out
      </button>
    </form>
  );
}
/** Staff workspace: 248 px navy sidebar on desktop, menu button + sheet below 1024 px. */
export function Shell({
  children,
  name,
  role,
  branch,
  nav = [],
}: {
  children: React.ReactNode;
  name: string;
  role: string;
  branch?: string;
  nav?: NavItem[];
}) {
  const roleLabel = branch ? `${role} · your branch` : role;
  const account = (
    <div className="rounded-xl bg-navy-2 p-3 text-[13px] text-[#DCE9EC]">
      Signed in as
      <strong className="block text-sm text-white">{name}</strong>
      <SignOut />
    </div>
  );
  return (
    <div className="min-h-screen bg-staff text-[15px] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="on-navy hidden flex-col gap-4 bg-navy px-3.5 py-5 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
        <div className="flex items-center gap-2.5 px-2">
          <BrandMark size={30} />
          <div className="leading-tight">
            <span className="block text-base font-bold">The Career Solutions</span>
            {!branch && (
              <span className="text-xs text-[#B9D4D9]">{role} · All India</span>
            )}
          </div>
        </div>
        {branch && (
          <div className="rounded-xl bg-navy-2 px-3 py-2.5">
            <span className="block text-xs text-[#B9D4D9]">{roleLabel}</span>
            <strong>{branch}</strong>
          </div>
        )}
        {nav.length > 0 && (
          <nav aria-label="Main navigation">
            <NavList items={nav} />
          </nav>
        )}
        <div className="mt-auto">{account}</div>
      </aside>
      <div className="min-w-0">
        <header className="on-navy flex items-center gap-2.5 bg-navy px-4 py-2 text-white lg:hidden">
          <MobileNav
            items={nav}
            scope={branch}
            roleLabel={roleLabel}
            footer={account}
          />
          <BrandMark size={28} />
          <div className="min-w-0 flex-1 leading-tight">
            <strong className="block">The Career Solutions</strong>
            <span className="block truncate text-xs text-[#B9D4D9]">
              {name} · {branch || "All India"}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 md:px-8 md:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
/** Student portal: one page, navy header with Sign out, no sidebar. */
export function StudentShell({
  children,
  name,
}: {
  children: React.ReactNode;
  name: string;
}) {
  return (
    <div className="min-h-screen bg-ivory text-[15px]">
      <header className="on-navy bg-navy text-white">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5 sm:px-8 sm:py-3.5">
          <BrandMark size={32} />
          <span className="text-[17px] font-bold tracking-[-0.01em] sm:text-lg">
            The Career Solutions
          </span>
          <span className="hidden border-l border-[#2B4D5E] pl-3 text-sm text-[#B9D4D9] sm:inline">
            Student portal
          </span>
          <span className="ml-auto hidden text-sm text-[#DCE9EC] md:inline">
            {name}
          </span>
          <form action={logout} className="ml-auto md:ml-0">
            <Button variant="navyOutline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-5 sm:gap-7 sm:px-8 sm:py-8">
        {children}
      </main>
      <footer className="mx-auto max-w-[1200px] px-4 pb-10 pt-2 text-[13px] text-muted sm:px-8">
        The Career Solutions · Student counselling &amp; college admissions
      </footer>
    </div>
  );
}
export function PageTitle({
  title,
  text,
  eyebrow,
  actions,
}: {
  title: string;
  text?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="text-[13px] font-semibold text-primary">{eyebrow}</p>
        )}
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-navy md:text-[32px]">
          {title}
        </h1>
        {text && <p className="mt-1 text-muted">{text}</p>}
      </div>
      {actions}
    </div>
  );
}
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "teal" | "navy";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-white p-3.5",
        tone === "teal" && "shadow-[inset_0_3px_0_#0F766E]",
        tone === "navy" && "shadow-[inset_0_3px_0_#102F40]",
      )}
    >
      <p className="text-[13px] text-muted">{label}</p>
      <p
        className={cn(
          "num mt-0.5 text-[28px] font-bold",
          tone === "teal" ? "text-primary" : "text-navy",
        )}
      >
        {typeof value === "number"
          ? new Intl.NumberFormat("en-IN").format(value)
          : value}
      </p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-semibold text-[#0B5650]">
      {children}
    </span>
  );
}
const tones = {
  neutral: "bg-neutral-bg text-neutral",
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  marigold: "bg-marigold-50 text-marigold-text",
} as const;
const statusStyles: Record<string, { tone: keyof typeof tones; glyph?: string }> = {
  Pending: { tone: "neutral", glyph: "○" },
  Uploaded: { tone: "info", glyph: "↑" },
  Verified: { tone: "success", glyph: "✓" },
  "Re-upload Needed": { tone: "warning", glyph: "!" },
  Scheduled: { tone: "info" },
  scheduled: { tone: "info" },
  Attended: { tone: "success", glyph: "✓" },
  attended: { tone: "success", glyph: "✓" },
  completed: { tone: "success", glyph: "✓" },
  Missed: { tone: "warning", glyph: "!" },
  missed: { tone: "warning", glyph: "!" },
  Applied: { tone: "info", glyph: "↑" },
  "Admission Confirmed": { tone: "success", glyph: "✓" },
  "Not Admitted": { tone: "neutral" },
  Withdrawn: { tone: "neutral" },
  Active: { tone: "success" },
};
/** Status always carries text and a glyph; colour is the third cue. */
export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const style = statusStyles[status] || { tone: "neutral" as const };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold",
        tones[style.tone],
      )}
    >
      {style.glyph && <span aria-hidden="true">{style.glyph}</span>}
      {label || status}
    </span>
  );
}
