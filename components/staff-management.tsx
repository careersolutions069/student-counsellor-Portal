import { ActionForm } from "@/components/action-form";
import { Field, Select } from "@/components/fields";
import { createStaff, toggleStaff, editStaff } from "@/app/actions";
import { Badge } from "@/components/shell";
import type { Staff } from "@/lib/auth";
export type Branch = {
  students?: { count: number }[];
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  google_maps_url?: string | null;
  is_active: boolean;
};
function StaffFields({
  member,
  branches,
  owner,
}: {
  member?: Staff;
  branches: Branch[];
  owner: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label="Full name"
        name="full_name"
        defaultValue={member?.full_name}
        required
      />
      {!member && (
        <>
          <Field label="Email address" name="email" type="email" required />
          <Field
            label="Temporary password · 8+ characters"
            name="password"
            type="password"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </>
      )}
      {owner ? (
        <>
          <Select
            label="Role"
            name="role"
            defaultValue={member?.role || "tele_counsellor"}
          >
            <option value="centre_head">Centre Head</option>
            <option value="tele_counsellor">Tele-counsellor</option>
          </Select>
          <Select
            label="Branch"
            name="branch_id"
            defaultValue={member?.branch_id || ""}
            required
          >
            <option value="" disabled>
              Select branch
            </option>
            {branches
              .filter((b) => b.is_active || b.id === member?.branch_id)
              .map((b) => (
                <option
                  key={b.id}
                  value={b.id}
                  disabled={!b.is_active && b.id !== member?.branch_id}
                >
                  {b.name}
                  {!b.is_active ? " (inactive)" : ""}
                </option>
              ))}
          </Select>
        </>
      ) : (
        <>
          <input type="hidden" name="role" value="tele_counsellor" />
          <input type="hidden" name="branch_id" value={branches[0]?.id || ""} />
        </>
      )}
    </div>
  );
}
export function StaffManagement({
  members,
  branches,
  owner,
}: {
  members: Staff[];
  branches: Branch[];
  owner: boolean;
}) {
  const visible = owner
    ? members
    : members.filter((m) => m.role === "tele_counsellor");
  return (
    <section className="panel space-y-5">
      <div>
        <h2 className="section-title">
          {owner ? "Staff management" : "Branch Tele-counsellors"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {owner
            ? "Manage Centre Heads and Tele-counsellors across India."
            : "Manage Tele-counsellors for your branch."}
        </p>
      </div>
      <details className="rounded-lg border border-line p-4">
        <summary className="font-semibold text-primary">
          Create staff account
        </summary>
        <ActionForm
          action={createStaff}
          submit="Create account"
          className="mt-5"
        >
          <StaffFields branches={branches} owner={owner} />
        </ActionForm>
      </details>
      <div className="space-y-3">
        {visible.map((member) => (
          <details
            key={member.id}
            className="rounded-xl border border-line p-5"
          >
            <summary className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{member.full_name}</p>
                <p className="mt-1 text-sm text-muted">
                  {member.email} · {member.role.replaceAll("_", " ")} ·{" "}
                  {branches.find((b) => b.id === member.branch_id)?.name ||
                    "All India"}
                </p>
              </div>
              <Badge>
                {member.role === "owner"
                  ? "Owner"
                  : member.is_active
                    ? "Active"
                    : "Inactive"}
              </Badge>
            </summary>
            {member.role !== "owner" && (
              <div className="mt-5 space-y-5">
                <ActionForm action={editStaff} submit="Save staff profile">
                  <input type="hidden" name="id" value={member.id} />
                  <StaffFields
                    member={member}
                    branches={branches}
                    owner={owner}
                  />
                  {owner && (
                    <p className="text-sm text-muted">
                      Changing a caller’s branch or role clears their student
                      assignments.
                    </p>
                  )}
                </ActionForm>
                <ActionForm
                  action={toggleStaff}
                  submit={member.is_active ? "Deactivate" : "Activate"}
                  variant="outline"
                >
                  <input type="hidden" name="id" value={member.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={String(!member.is_active)}
                  />
                </ActionForm>
              </div>
            )}
          </details>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="text-sm text-muted">No staff accounts yet.</p>
      )}
    </section>
  );
}
