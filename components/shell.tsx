import {
  GraduationCap,
  LayoutDashboard,
  MapPin,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";
export function Shell({
  children,
  name,
  role,
  branch,
  navigation,
}: {
  children: React.ReactNode;
  name: string;
  role: string;
  branch?: string;
  navigation?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col bg-[#102f40] text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="flex items-center gap-3 p-6">
          <div className="rounded-xl bg-teal-400/15 p-2.5">
            <GraduationCap className="text-teal-300" size={26} />
          </div>
          <div>
            <p className="font-bold tracking-tight">Career Solution</p>
            <p className="mt-0.5 text-xs text-slate-300">
              Counselling & admissions
            </p>
          </div>
        </div>
        <nav aria-label="Main navigation" className="px-4 pb-4 lg:mt-5">
          <span
            aria-current={navigation ? undefined : "page"}
            className="flex items-center gap-3 rounded-lg bg-white/10 px-4 py-3 text-sm font-medium"
          >
            <LayoutDashboard size={18} />
            Dashboard
          </span>
          {navigation}
        </nav>
        <div className="mt-auto hidden p-6 lg:block">
          <ShieldCheck size={22} className="mb-3 text-teal-300" />
          <p className="text-sm font-medium">{role}</p>
          <p className="mt-1 text-sm text-slate-300">
            {branch || "Career Solution portal"}
          </p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 md:px-9">
          <span className="flex items-center gap-2 text-sm text-slate-500">
            <MapPin size={16} />
            {branch || "All India"}
          </span>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-xs text-slate-500">{role}</p>
            </div>
            <form action={logout}>
              <Button variant="ghost" size="sm">
                <LogOut size={16} />
                <span className="sr-only sm:not-sr-only">Sign out</span>
              </Button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] space-y-7 p-5 md:p-9">
          {children}
        </main>
      </div>
    </div>
  );
}
export function PageTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-teal-700">
        Career Solution portal
      </p>
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-2 text-slate-500">{text}</p>
    </div>
  );
}
export function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="panel">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
      {children}
    </span>
  );
}
