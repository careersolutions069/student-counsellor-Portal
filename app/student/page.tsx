import { Check, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentDocuments } from "@/components/student-documents";
import { AdmissionProgress } from "@/components/admission-progress";
import { CollegeIllustration } from "@/components/brand";
import { StatusBadge, StudentShell } from "@/components/shell";
import { admissionStep, type StudentDocument } from "@/lib/student-documents";
import { requireStudent, type Portal } from "@/lib/auth";
import { visitDate, visitTile, visitTime } from "@/lib/utils";
/** The document that needs the student, if uploads are on: Re-upload Needed first, then Pending. */
function documentAction(student: Portal): StudentDocument | undefined {
  if (!student.allow_student_upload) return undefined;
  return (
    student.documents.find((d) => d.status === "Re-upload Needed") ||
    student.documents.find((d) => d.status === "Pending")
  );
}
function NextStep({ student }: { student: Portal }) {
  const appointment = student.appointments[0];
  const doc = documentAction(student);
  const eyebrow = (
    <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.05em] text-marigold-soft">
      <span aria-hidden="true" className="size-2 rounded-full bg-marigold" />
      Your next step
    </p>
  );
  const docLabel = doc && `${doc.document_name} — ${doc.status === "Re-upload Needed" ? "re-upload" : "upload"}`;
  if (appointment) {
    const tile = visitTile(appointment.scheduled_at);
    return (
      <section aria-labelledby="next" className="on-navy flex min-w-0 flex-col gap-4 rounded-[18px] bg-navy p-5 text-white lg:flex-[7_1_520px] lg:gap-[18px] lg:rounded-[20px] lg:px-7 lg:py-6">
        {eyebrow}
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-7">
          <div className="lg:flex-1">
            <h2 id="next" className="mb-3 text-[22px] font-bold tracking-[-0.02em] lg:text-[26px]">Your next visit</h2>
            <div className="flex items-center gap-4">
              <div aria-hidden="true" className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-white py-2 text-navy lg:hidden">
                <span className="text-[11px] font-bold tracking-[0.06em] text-primary">{tile.weekday}</span>
                <span className="num text-[26px] font-bold leading-none">{tile.day}</span>
                <span className="text-[11px] font-bold tracking-[0.06em]">{tile.month}</span>
              </div>
              <div>
                <p className="num text-lg font-bold lg:text-2xl">{visitDate(appointment.scheduled_at)}</p>
                <p className="num text-base text-[#DCE9EC] lg:text-xl">
                  {visitTime(appointment.scheduled_at)} <span className="text-sm text-[#B9D4D9]">IST · Face-to-face counselling</span>
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3.5 lg:flex-1">
            <div className="flex gap-2.5">
              <MapPin size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-marigold-soft lg:hidden" />
              <address className="text-[15px] not-italic leading-normal text-[#E6EEF0]">
                <strong className="text-white">Career Solution, {student.branch.name}</strong>
                <br />
                {student.branch.address}
              </address>
            </div>
            {student.branch.google_maps_url && (
              <Button asChild variant="onNavy" size="lg" className="self-stretch rounded-xl lg:self-start">
                <a href={student.branch.google_maps_url} target="_blank" rel="noreferrer">
                  Open in Google Maps <span aria-hidden="true">↗</span>
                </a>
              </Button>
            )}
          </div>
        </div>
        {doc && (
          <a href={`#doc-${doc.id}`} className="flex items-center gap-3 rounded-xl bg-navy-2 px-4 py-3 text-white">
            <span aria-hidden="true" className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[#FFF1E0] text-sm font-bold text-[#9A4A00]">1</span>
            <span className="flex-1">
              Also needed before your visit: <strong>{docLabel}</strong>
            </span>
            <span className="font-bold text-marigold-soft">Upload now →</span>
          </a>
        )}
      </section>
    );
  }
  if (doc) {
    return (
      <section aria-labelledby="next" className="on-navy flex min-w-0 flex-col gap-3.5 rounded-[18px] bg-navy p-5 text-white lg:flex-[7_1_520px] lg:rounded-[20px] lg:px-7 lg:py-6">
        {eyebrow}
        <h2 id="next" className="text-[22px] font-bold tracking-[-0.02em] lg:text-[26px]">
          {doc.status === "Re-upload Needed" ? "Re-upload" : "Upload"} your {doc.document_name}
        </h2>
        {doc.remarks && (
          <>
            <p className="text-[#DCE9EC]">
              {doc.status === "Re-upload Needed" ? "Your branch checked the file you sent and left a note:" : "A note from your branch:"}
            </p>
            <blockquote className="whitespace-pre-line rounded-xl bg-navy-2 px-4 py-3 text-white">“{doc.remarks}”</blockquote>
          </>
        )}
        <Button asChild variant="onNavy" size="lg" className="self-stretch rounded-xl sm:self-start">
          <a href={`#doc-${doc.id}`}>Go to {doc.document_name}</a>
        </Button>
      </section>
    );
  }
  return (
    <section aria-labelledby="next" className="flex min-w-0 gap-4 rounded-[18px] border border-line bg-white p-5 lg:flex-[7_1_520px] lg:rounded-[20px] lg:px-7 lg:py-6">
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success-bg text-success">
        <Check size={22} />
      </span>
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-muted">Your next step</p>
        <h2 id="next" className="mt-1 text-xl font-bold text-navy">Nothing to do right now</h2>
        <p className="mt-1.5 text-[#3E4F59]">
          Your counsellor is working on the next stage. When there is a visit or a document for you, it will appear here.
        </p>
      </div>
    </section>
  );
}
function Shortlist({ shortlists }: { shortlists: Portal["shortlists"] }) {
  const status = (value: string | null) =>
    value ? <StatusBadge status={value} /> : <StatusBadge status="Pending" label="Awaiting update" />;
  return (
    <section aria-labelledby="shortlist" className="overflow-hidden lg:rounded-[20px] lg:border lg:border-line lg:bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-1 pb-3 lg:gap-3 lg:px-6 lg:pb-3.5 lg:pt-5">
        <h2 id="shortlist" className="text-[21px] font-bold tracking-[-0.015em] text-navy lg:text-2xl">Colleges shortlisted for you</h2>
        {shortlists.length > 0 && (
          <p className="text-sm text-muted">
            {shortlists.length} {shortlists.length === 1 ? "college" : "colleges"} chosen by your counsellor · fees are estimates and may change
          </p>
        )}
      </div>
      {shortlists.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-input-line bg-white p-5 lg:m-6 lg:mt-0">
          <p className="font-semibold text-navy">No colleges added yet</p>
          <p className="mt-1 text-[#3E4F59]">
            After your counsellor discusses your goals, marks and budget with you, the colleges they recommend will appear here with estimated fees and admission status.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {shortlists.map((c) => (
              <article key={c.id} className="rounded-[18px] border border-line bg-white p-[18px]">
                <h3 className="text-[17px] font-bold leading-snug text-navy">{c.college_name}</h3>
                <p className="mt-1 font-semibold text-primary">{c.course_name}</p>
                <dl className="mt-3.5 space-y-3 border-t border-sand pt-3.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted">Estimated fees</dt>
                    <dd className="num text-base font-bold">{c.fees_estimate || "To be confirmed"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Admission status</dt>
                    <dd>{status(c.admission_status)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Documents for this college</dt>
                    <dd className="mt-0.5 whitespace-pre-line">{c.document_status || "Your centre will share the required documents."}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-[860px] [&_td]:p-4 [&_td]:align-top [&_td]:text-[15px] [&_th]:px-4 [&_th]:py-3 [&_tr:last-child_td]:border-b-0">
              <thead>
                <tr>
                  <th scope="col" className="w-[38%]">College and course</th>
                  <th scope="col">Estimated fees</th>
                  <th scope="col">Admission status</th>
                  <th scope="col" className="w-[30%]">Documents for this college</th>
                </tr>
              </thead>
              <tbody>
                {shortlists.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong className="block text-base text-navy">{c.college_name}</strong>
                      <span className="mt-1 block font-semibold text-primary">{c.course_name}</span>
                    </td>
                    <td className="num text-[17px] font-bold">{c.fees_estimate || "To be confirmed"}</td>
                    <td>{status(c.admission_status)}</td>
                    <td className="whitespace-pre-line !text-sm">
                      {c.document_status || <span className="text-muted">Your centre will share the required documents.</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
export default async function StudentPage() {
  const student = await requireStudent();
  const firstName = student.full_name.split(" ")[0];
  const dob = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(student.dob));
  return (
    <StudentShell name={student.full_name}>
      <section aria-labelledby="welcome" className="flex flex-wrap items-end gap-4 lg:gap-8">
        <div className="min-w-0 flex-[1_1_560px]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold tracking-[0.02em] text-primary lg:text-sm">
                Student portal · {student.branch.name} branch
              </p>
              <h1 id="welcome" className="mt-1 text-[28px] font-bold leading-[1.1] tracking-[-0.03em] text-navy lg:mb-4 lg:text-[44px] lg:leading-[1.05] lg:tracking-[-0.035em]">
                Welcome, {firstName}
              </h1>
            </div>
            <CollegeIllustration width={92} height={62} className="h-[62px] w-[92px] shrink-0 lg:hidden" />
          </div>
          <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-[14px] border border-line bg-white lg:mt-0 lg:flex lg:flex-wrap">
            <div className="col-span-2 border-b border-sand px-4 py-3 lg:hidden">
              <dt className="text-[13px] text-muted">Student</dt>
              <dd className="font-semibold">{student.full_name}</dd>
            </div>
            <div className="col-span-2 border-b border-sand px-4 py-3 lg:order-2 lg:flex-[2_1_260px] lg:border-b-0 lg:border-r lg:px-5">
              <dt className="text-[13px] text-muted">Target course</dt>
              <dd className="font-semibold">{student.target_course || "To be discussed"}</dd>
            </div>
            <div className="col-span-2 border-b border-sand px-4 py-3 lg:order-1 lg:flex-[1_1_180px] lg:border-b-0 lg:border-r lg:px-5">
              <dt className="text-[13px] text-muted">Registration no.</dt>
              <dd className="font-mono text-[15px]">{student.registration_number}</dd>
            </div>
            <div className="col-span-2 px-4 py-3 lg:order-3 lg:flex-[1_1_180px] lg:px-5">
              <dt className="text-[13px] text-muted">Your branch</dt>
              <dd className="font-semibold">{student.branch.name}</dd>
            </div>
          </dl>
        </div>
        <CollegeIllustration width={250} height={170} className="hidden h-[170px] w-[250px] shrink-0 lg:block" />
      </section>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-6">
        <NextStep student={student} />
        <AdmissionProgress current={admissionStep(student.pipeline_stage, student.shortlists, student.documents)} />
      </div>

      <Shortlist shortlists={student.shortlists} />

      <StudentDocuments documents={student.documents} allowUpload={student.allow_student_upload} student />

      {student.counselling_documents.length > 0 && (
        <section aria-labelledby="counselling-docs" className="rounded-[18px] border border-line bg-white p-5 lg:rounded-[20px] lg:px-6">
          <h2 id="counselling-docs" className="text-[21px] font-bold tracking-[-0.015em] text-navy lg:text-2xl">
            Counselling Documents &amp; Allotments
          </h2>
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">
            {student.counselling_documents.map((doc) => (
              <li key={doc.id} className="min-w-0 rounded-[14px] border border-line p-4">
                <h3 className="font-semibold">{doc.label}</h3>
                <p className="mt-1 break-words text-sm text-muted">{doc.file_name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild variant="neutral" size="sm">
                    <a href={`/counselling-documents/${doc.id}?as=student`} target="_blank" rel="noreferrer">View PDF</a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/counselling-documents/${doc.id}?as=student&download=1`} target="_blank" rel="noreferrer">Download PDF</a>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="profile" className="flex flex-wrap items-start gap-3 lg:gap-6">
        <div className="min-w-0 flex-[1_1_520px]">
          <h2 id="profile" className="mb-2.5 text-lg font-bold text-navy">Your details</h2>
          <dl className="grid gap-4 rounded-[14px] border border-line bg-white px-5 py-4 sm:grid-cols-3">
            <div><dt className="text-[13px] text-muted">Full name</dt><dd className="font-semibold">{student.full_name}</dd></div>
            <div><dt className="text-[13px] text-muted">Phone</dt><dd className="num font-semibold">{/^[0-9]{10}$/.test(student.student_phone) ? `+91 ${student.student_phone.slice(0, 5)} ${student.student_phone.slice(5)}` : student.student_phone}</dd></div>
            <div><dt className="text-[13px] text-muted">Date of birth</dt><dd className="num font-semibold">{dob}</dd></div>
          </dl>
        </div>
        <p className="flex-[1_1_300px] text-sm text-muted lg:mt-[34px]">
          These details are managed by your branch. If something is wrong, mention it to your counsellor at your next visit.
        </p>
      </section>
    </StudentShell>
  );
}
