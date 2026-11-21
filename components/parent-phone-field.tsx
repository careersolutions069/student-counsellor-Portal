"use client";
import { useState, useTransition } from "react";
import { Field } from "@/components/fields";
import { checkParentPhone } from "@/app/counsellor/actions";
export function ParentPhoneField({
  defaultValue = "",
  studentId,
  branchId,
  value,
  onChange,
}: {
  defaultValue?: string;
  studentId?: string;
  branchId?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const [warning, setWarning] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <Field
        label="Parent phone"
        name="parent_phone"
        type="tel"
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange}
        onBlur={(event) => {
          const input = event.currentTarget;
          const value = input.value;
          if (!value.trim()) {
            setWarning("");
            return;
          }
          const form = new FormData();
          form.set("phone", value);
          if (studentId) form.set("student_id", studentId);
          const selected = input.form
            ? new FormData(input.form).get("branch_id")
            : null;
          const branch =
            typeof selected === "string" && selected ? selected : branchId;
          if (branch) form.set("branch_id", branch);
          startTransition(async () => {
            const result = await checkParentPhone(form);
            if (input.value === value) setWarning(result.warning || "");
          });
        }}
      />
      {pending && (
        <p className="mt-2 text-sm text-slate-500" role="status">
          Checking parent number…
        </p>
      )}
      {warning && (
        <p className="mt-2 text-sm text-amber-800" role="status">
          {warning}
        </p>
      )}
    </div>
  );
}
