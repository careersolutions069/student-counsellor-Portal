import { Input } from "@/components/ui/input";
export function Field({
  label,
  ...props
}: React.ComponentProps<typeof Input> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <Input {...props} />
    </label>
  );
}
export function Select({
  label,
  children,
  ...props
}: React.ComponentProps<"select"> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        aria-label={label}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base focus-visible:outline-teal-700"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
