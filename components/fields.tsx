import { Input } from "@/components/ui/input";
export function Field({
  label,
  ...props
}: React.ComponentProps<typeof Input> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
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
      <span className="text-sm font-semibold text-ink">{label}</span>
      <select
        aria-label={label}
        className="h-11 w-full rounded-[10px] border-[1.5px] border-input-line bg-white px-3 text-base text-ink focus-visible:border-primary"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
