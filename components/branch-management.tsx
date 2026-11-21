import { ActionForm } from "@/components/action-form";
import { Field, Select } from "@/components/fields";
import { createBranch, updateBranch } from "@/app/actions";
import { Badge } from "@/components/shell";
import type { Branch } from "@/components/staff-management";
function BranchFields({ branch }: { branch?: Branch }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Branch name"
        name="name"
        defaultValue={branch?.name}
        required
      />
      <Field
        label="Three-letter code"
        name="code"
        pattern="[A-Za-z]{3}"
        maxLength={3}
        defaultValue={branch?.code}
        placeholder="PAT"
        required
      />
      <Field label="City" name="city" defaultValue={branch?.city} required />
      <Field
        label="Address"
        name="address"
        defaultValue={branch?.address}
        required
      />
      <Field
        label="Google Maps URL"
        name="google_maps_url"
        type="url"
        defaultValue={branch?.google_maps_url || ""}
        placeholder="https://www.google.com/maps/..."
        required
      />
    </div>
  );
}
export function BranchManagement({ branches }: { branches: Branch[] }) {
  return (
    <section className="panel space-y-5">
      <h2 className="section-title">Branch management</h2>
      <details className="rounded-lg border border-slate-200 p-4">
        <summary className="font-semibold text-teal-800">Create branch</summary>
        <ActionForm
          action={createBranch}
          submit="Create branch"
          className="mt-5"
        >
          <BranchFields />
        </ActionForm>
      </details>
      <div className="space-y-3">
        {branches.map((b) => (
          <details
            key={b.id}
            className="rounded-xl border border-slate-200 p-5"
          >
            <summary className="flex flex-wrap justify-between gap-3 font-semibold">
              <span>
                {b.name} · {b.code}{" "}
                <span className="font-normal text-slate-500">
                  · {b.students?.[0]?.count || 0} leads
                </span>
              </span>
              <Badge>{b.is_active ? "Active" : "Inactive"}</Badge>
            </summary>
            <ActionForm
              action={updateBranch}
              submit="Save branch"
              className="mt-5"
            >
              <input type="hidden" name="id" value={b.id} />
              <BranchFields branch={b} />
              <Select
                label="Branch access"
                name="is_active"
                defaultValue={String(b.is_active)}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </ActionForm>
          </details>
        ))}
      </div>
    </section>
  );
}
