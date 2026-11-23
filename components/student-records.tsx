import { ActionForm } from "@/components/action-form";
import { Field, Select } from "@/components/fields";
import {
  saveStudent,
  transferStudent,
  addStudentActivity,
  updateActivity,
  deleteShortlist,
} from "@/app/actions";
import { Badge } from "@/components/shell";
import { ParentPhoneField } from "@/components/parent-phone-field";
import { CounsellingStage } from "@/components/counselling-stage";
import { StudentDocuments } from "@/components/student-documents";
import type { StudentDocument } from "@/lib/student-documents";
import { ProfileCompletion } from "@/components/profile-completion";
import type { Staff } from "@/lib/auth";
import type { Branch } from "@/components/staff-management";
import { dateTime } from "@/lib/utils";
import { ADMISSION_STATUSES } from "@/lib/admission-status";
export type Student = {
  id: string;
  branch_id: string;
  assigned_to: string | null;
  full_name: string;
  student_phone: string;
  parent_phone: string | null;
  dob: string | null;
  registration_number: string | null;
  is_profile_complete: boolean;
  lead_source: string | null;
  pipeline_stage: string;
  next_call_at?: string | null;
  allow_student_upload?: boolean;
  "F/N"?: string | null;
  city?: string | null;
  state?: string | null;
  counselling_amount?: number | string | null;
  marks_type?: "exact" | "approximate" | null;
  selected_courses?: string[];
  college_type?: "government" | "private" | null;
  college_pdf_path?: string | null;
  college_pdf_name?: string | null;
  visit_details_completed?: boolean;
  target_course?: string | null;
  academic_stream?: string | null;
  percentage_or_score?: string | null;
  preferred_locations?: string | null;
  budget_range?: string | null;
  drop_reason?: string | null;
};
export type Activity = {
  id: string;
  student_id: string;
  outcome?: string;
  remarks?: string;
  next_callback_at?: string;
  scheduled_at?: string;
  status?: string;
  college_name?: string;
  course_name?: string;
  admission_status?: string | null;
  legacy_admission_status?: string | null;
  fees_estimate?: string;
  document_status?: string;
  is_shared?: boolean;
};
const stages = [
  "New Enquiry",
  "Contacted",
  "Meeting Scheduled",
  "F2F Scheduled",
  "F2F Missed",
  "Dropped",
  "Counselling",
  "Applied",
  "Admitted",
  "Closed",
];
function StudentFields({
  student,
  staff,
  caller,
}: {
  student?: Student;
  staff: Staff[];
  caller: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Full name"
        name="full_name"
        defaultValue={student?.full_name}
        required
      />
      <Field
        label="Student phone · 10 digits"
        name="student_phone"
        inputMode="numeric"
        defaultValue={student?.student_phone}
        required
      />
      <ParentPhoneField
        defaultValue={student?.parent_phone || ""}
        studentId={student?.id}
        branchId={student?.branch_id}
      />
      <Field
        label="Lead source"
        name="lead_source"
        defaultValue={student?.lead_source || ""}
      />
      <Select
        label="Admission progress"
        name="pipeline_stage"
        defaultValue={student?.pipeline_stage || "New Enquiry"}
      >
        {stages.map((stage) => (
          <option key={stage}>{stage}</option>
        ))}
      </Select>
      {[
        ["target_course", "Target course"],
        ["academic_stream", "Academic stream"],
        ["percentage_or_score", "Percentage or score"],
        ["preferred_locations", "Preferred locations"],
        ["budget_range", "Budget range"],
        ["drop_reason", "Drop reason"],
      ].map(([key, label]) => (
        <Field
          key={key}
          label={label}
          name={key}
          defaultValue={(student?.[key as keyof Student] as string) || ""}
        />
      ))}
      {caller ? (
        <input
          type="hidden"
          name="assigned_to"
          value={student?.assigned_to || ""}
        />
      ) : (
        <Select
          label="Assigned tele-counsellor"
          name="assigned_to"
          defaultValue={student?.assigned_to || ""}
        >
          <option value="">Unassigned</option>
          {staff
            .filter(
              (s) =>
                s.role === "tele_counsellor" &&
                (s.is_active || s.id === student?.assigned_to),
            )
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
                {!s.is_active ? " (inactive)" : ""}
              </option>
            ))}
        </Select>
      )}
    </div>
  );
}
export function StudentRecords({
  students,
  branches,
  staff,
  role,
  calls = [],
  appointments = [],
  shortlists = [],
  defaultBranch,
  documents = [],
}: {
  students: Student[];
  branches: Branch[];
  staff: Staff[];
  role: Staff["role"];
  calls?: Activity[];
  appointments?: Activity[];
  shortlists?: Activity[];
  defaultBranch?: string;
  documents?: StudentDocument[];
}) {
  const caller = role === "tele_counsellor";
  return (
    <section className="panel space-y-5">
      <div>
        <h2 className="section-title">
          {caller ? "Assigned students" : "Student records"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {caller
            ? "Your enquiries and counselling activity."
            : "Manage enquiries, complete profiles and follow admission progress."}
        </p>
      </div>
      {!caller && (
        <details className="rounded-lg border border-line p-4">
          <summary className="text-sm font-semibold text-primary">
            Add student enquiry
          </summary>
          <ActionForm
            action={saveStudent}
            submit="Save enquiry"
            className="mt-5"
          >
            {role === "owner" ? (
              <Select
                label="Branch"
                name="branch_id"
                defaultValue={defaultBranch}
                required
              >
                {branches
                  .filter((b) => b.is_active)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </Select>
            ) : (
              <input
                type="hidden"
                name="branch_id"
                value={branches[0]?.id || ""}
              />
            )}
            <StudentFields
              staff={role === "owner" ? [] : staff}
              caller={false}
            />
            <p className="text-sm text-muted">
              Assign a counsellor from the student’s record after saving.
            </p>
          </ActionForm>
        </details>
      )}
      {students.length === 0 && (
        <p className="py-8 text-center text-muted">
          No students to show yet.
        </p>
      )}
      <div className="space-y-3">
        {students.map((s) => (
          <details
            key={s.id}
            className="group rounded-xl border border-line"
          >
            <summary className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-semibold">{s.full_name}</p>
                <p className="mt-1 text-sm text-muted">
                  {s.registration_number || "Profile incomplete"} ·{" "}
                  {s.student_phone} ·{" "}
                  {branches.find((b) => b.id === s.branch_id)?.name}
                </p>
              </div>
              <Badge>{s.pipeline_stage}</Badge>
            </summary>
            <div className="space-y-6 border-t border-sand p-5">
              <ActionForm
                action={saveStudent}
                submit="Save student"
                variant="outline"
              >
                <input type="hidden" name="id" value={s.id} />
                <StudentFields
                  student={s}
                  staff={staff.filter((p) => p.branch_id === s.branch_id)}
                  caller={caller}
                />
              </ActionForm>
              {!caller && <ProfileCompletion student={s} />}
              {!caller && <CounsellingStage studentId={s.id} />}
              {!caller && <StudentDocuments documents={documents.filter(d=>d.student_id===s.id)} allowUpload={Boolean(s.allow_student_upload)} studentId={s.id}/>}
              <div className="grid gap-5 xl:grid-cols-3">
                <details className="rounded-lg border border-line p-4">
                  <summary className="text-sm font-semibold">
                    Log a call
                  </summary>
                  <ActionForm
                    action={addStudentActivity}
                    submit="Save call"
                    className="mt-4"
                  >
                    <input type="hidden" name="kind" value="call" />
                    <input type="hidden" name="student_id" value={s.id} />
                    <Field
                      label="Call outcome"
                      name="outcome"
                      placeholder="Connected / no answer"
                      required
                    />
                    <Field label="Internal remarks" name="remarks" />
                    <Field
                      label="Next callback · IST"
                      name="next_callback_at"
                      type="datetime-local"
                    />
                  </ActionForm>
                </details>
                <details className="rounded-lg border border-line p-4">
                  <summary className="text-sm font-semibold">
                    Schedule meeting
                  </summary>
                  <ActionForm
                    action={addStudentActivity}
                    submit="Book appointment"
                    className="mt-4"
                  >
                    <input type="hidden" name="kind" value="appointment" />
                    <input type="hidden" name="student_id" value={s.id} />
                    <Field
                      label="Face-to-face appointment · IST"
                      name="scheduled_at"
                      type="datetime-local"
                      required
                    />
                  </ActionForm>
                </details>
                <details className="rounded-lg border border-line p-4">
                  <summary className="text-sm font-semibold">
                    Add college shortlist
                  </summary>
                  <ActionForm
                    action={addStudentActivity}
                    submit="Save shortlist"
                    className="mt-4"
                  >
                    <input type="hidden" name="kind" value="shortlist" />
                    <input type="hidden" name="student_id" value={s.id} />
                    <Field label="College" name="college_name" required />
                    <Field label="Course" name="course_name" required />
                    <Field label="Estimated fees" name="fees_estimate" />
                    <Field
                      label="Document checklist"
                      name="document_status"
                      placeholder="Class 12 marksheet pending"
                    />
                    <Select
                      label="Admission status"
                      name="admission_status"
                      defaultValue="Pending"
                      required
                    >
                      {ADMISSION_STATUSES.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </Select>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="is_shared" defaultChecked />
                      Share with student
                    </label>
                  </ActionForm>
                </details>
              </div>
              <div className="grid gap-5 lg:grid-cols-3">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">
                    Internal call history
                  </h3>
                  {calls
                    .filter((c) => c.student_id === s.id)
                    .map((c) => (
                      <p key={c.id} className="mb-2 text-sm text-[#3E4F59]">
                        {c.outcome} · {c.remarks || "No remarks"}
                        {c.next_callback_at &&
                          ` · Callback ${dateTime(c.next_callback_at)}`}
                      </p>
                    ))}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Appointments</h3>
                  {appointments
                    .filter((a) => a.student_id === s.id)
                    .map((a) => (
                      <details
                        key={a.id}
                        className="mb-3 rounded-lg border border-line p-3"
                      >
                        <summary className="text-sm">
                          {dateTime(a.scheduled_at!)} · {a.status}
                        </summary>
                        <ActionForm
                          action={updateActivity}
                          submit="Update meeting"
                          className="mt-4"
                        >
                          <input
                            type="hidden"
                            name="kind"
                            value="appointment"
                          />
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="student_id" value={s.id} />
                          <Field
                            label="Meeting time · IST"
                            name="scheduled_at"
                            type="datetime-local"
                            defaultValue={new Date(
                              new Date(a.scheduled_at!).getTime() + 19800000,
                            )
                              .toISOString()
                              .slice(0, 16)}
                            required
                          />
                          <Select
                            label="Meeting status"
                            name="status"
                            defaultValue={a.status}
                          >
                            {[
                              "scheduled",
                              "attended",
                              "completed",
                              "cancelled",
                              "missed",
                            ].map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </Select>
                        </ActionForm>
                      </details>
                    ))}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">
                    College shortlists
                  </h3>
                  {shortlists
                    .filter((c) => c.student_id === s.id)
                    .map((c) => (
                      <details
                        key={c.id}
                        className="mb-3 rounded-lg border border-line p-3"
                      >
                        <summary className="text-sm">
                          {c.college_name} · {c.admission_status || "Needs review"} ·{" "}
                          {c.is_shared ? "Shared" : "Internal"}
                        </summary>
                        <ActionForm
                          action={updateActivity}
                          submit="Update shortlist"
                          className="mt-4"
                        >
                          <input type="hidden" name="kind" value="shortlist" />
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="student_id" value={s.id} />
                          <Field
                            label="College"
                            name="college_name"
                            defaultValue={c.college_name}
                            required
                          />
                          <Field
                            label="Course"
                            name="course_name"
                            defaultValue={c.course_name}
                            required
                          />
                          <Field
                            label="Estimated fees"
                            name="fees_estimate"
                            defaultValue={c.fees_estimate || ""}
                          />
                          <Field
                            label="Document checklist"
                            name="document_status"
                            defaultValue={c.document_status || ""}
                          />
                          {!c.admission_status && (
                            <p role="note" className="rounded-lg bg-marigold-50 p-3 text-sm text-marigold-text">
                              Needs review. Earlier status entered: “{c.legacy_admission_status}”. Choose a status to resolve.
                            </p>
                          )}
                          <Select
                            label="Admission status"
                            name="admission_status"
                            defaultValue={c.admission_status || ""}
                            required
                          >
                            {!c.admission_status && (
                              <option value="" disabled>
                                Choose a status
                              </option>
                            )}
                            {ADMISSION_STATUSES.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </Select>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="is_shared"
                              defaultChecked={c.is_shared}
                            />
                            Share with student
                          </label>
                        </ActionForm>
                        {!caller && (
                          <details className="mt-4">
                            <summary className="text-sm font-semibold text-danger">
                              Delete shortlist entry
                            </summary>
                            <ActionForm
                              action={deleteShortlist}
                              submit="Confirm deletion"
                              variant="outline"
                              className="mt-3"
                            >
                              <input type="hidden" name="id" value={c.id} />
                              <p className="text-sm text-muted">
                                This removes the college entry from the
                                student’s shortlist.
                              </p>
                            </ActionForm>
                          </details>
                        )}
                      </details>
                    ))}
                </div>
              </div>
              {role === "owner" && (
                <details className="rounded-lg border border-line p-4">
                  <summary className="text-sm font-semibold">
                    Transfer student to another branch
                  </summary>
                  <p className="my-3 text-sm text-muted">
                    Moves the student and related records. Clears the counsellor
                    assignment and ends student sessions. The registration ID is
                    retained.
                  </p>
                  <ActionForm
                    action={transferStudent}
                    submit="Transfer student"
                    variant="outline"
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <Field
                      label="Transfer reason"
                      name="reason"
                      maxLength={1000}
                      required
                    />
                    <Select
                      label="Destination branch"
                      name="branch_id"
                      required
                    >
                      {branches
                        .filter((b) => b.is_active && b.id !== s.branch_id)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                    </Select>
                  </ActionForm>
                </details>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
