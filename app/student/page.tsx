import { Button } from "@/components/ui/button";
import { StudentDocuments } from "@/components/student-documents";
import { AdmissionProgress } from "@/components/admission-progress";
import { admissionStep } from "@/lib/student-documents";
import { requireStudent } from "@/lib/auth";
import { Shell, PageTitle, Badge } from "@/components/shell";
import { CalendarDays, MapPin, BookOpen, FileCheck2 } from "lucide-react";
import { dateTime } from "@/lib/utils";
export default async function StudentPage() {
  const student = await requireStudent();
  const appointment = student.appointments[0];
  return (
    <Shell name={student.full_name} role="Student" branch={student.branch.name}>
      <PageTitle
        title={`Welcome, ${student.full_name.split(" ")[0]}`}
        text="Your college journey, one step at a time."
      />
      <section className="rounded-2xl bg-[#102f40] p-6 text-white sm:p-7">
        <div className="flex flex-wrap justify-between gap-6">
          <div><p className="text-sm text-slate-300">Student</p><h2 className="mt-2 text-2xl font-semibold">{student.full_name}</h2><p className="mt-2 font-semibold tracking-wide">{student.registration_number}</p><p className="mt-3 text-sm">Target course · {student.target_course || "To be discussed"}</p></div>
          <div className="max-w-md"><h3 className="font-semibold">{student.branch.name}</h3><p className="mt-2 text-sm text-slate-300">{student.branch.address}</p>{student.branch.google_maps_url&&<a className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/40 px-4 py-3 text-sm font-medium" href={student.branch.google_maps_url} target="_blank" rel="noreferrer"><MapPin size={17}/>Open Branch in Google Maps</a>}</div>
        </div>
      </section>
      <AdmissionProgress current={admissionStep(student.pipeline_stage,student.shortlists,student.documents)}/>
      {appointment&&<section className="panel"><CalendarDays size={22} className="mb-4 text-teal-700"/><h2 className="section-title">Upcoming appointment</h2><p className="mt-4 text-xl font-semibold">{dateTime(appointment.scheduled_at)}</p><p className="mt-2 text-sm text-slate-500">Face-to-face counselling · India Standard Time</p></section>}
      <section className="panel">
        <div className="mb-6 flex items-center gap-3">
          <BookOpen size={22} className="text-teal-700" />
          <h2 className="section-title">Recommended college shortlist</h2>
        </div>
        {student.shortlists.length === 0 ? (
          <p className="text-slate-500">
            Your counsellor will share your college shortlist after discussing
            your goals.
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {student.shortlists.map((c) => (
              <article
                key={c.id}
                className="rounded-xl border border-slate-200 p-5"
              >
                <h3 className="font-semibold">{c.college_name}</h3>
                <p className="mt-2 text-slate-500">{c.course_name}</p>
                <p className="my-4 text-sm">
                  Estimated fees · {c.fees_estimate || "To be confirmed"}
                </p>
                <Badge>{c.admission_status || "Awaiting update"}</Badge>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <FileCheck2 size={16} />
                    Document checklist
                  </p>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-500">
                    {c.document_status ||
                      "Your centre will share the required documents."}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {student.counselling_documents.length>0&&<section className="panel space-y-5"><h2 className="section-title">Counselling Documents &amp; Allotments</h2><div className="grid gap-4 lg:grid-cols-2">{student.counselling_documents.map(doc=><article key={doc.id} className="min-w-0 rounded-xl border border-slate-200 p-5"><h3 className="font-semibold">{doc.label}</h3><p className="my-3 break-words text-sm text-slate-500">{doc.file_name}</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a href={`/counselling-documents/${doc.id}?as=student`} target="_blank" rel="noreferrer">View PDF</a></Button><Button asChild variant="outline"><a href={`/counselling-documents/${doc.id}?as=student&download=1`} target="_blank" rel="noreferrer">Download PDF</a></Button></div></article>)}</div></section>}
      <div className="panel"><StudentDocuments documents={student.documents} allowUpload={student.allow_student_upload} student/></div>
      <section className="panel">
        <h2 className="section-title">Your profile</h2>
        <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Full name</dt>
            <dd className="mt-1 font-medium">{student.full_name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Phone number</dt>
            <dd className="mt-1 font-medium">{student.student_phone}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Date of birth</dt>
            <dd className="mt-1 font-medium">
              {new Intl.DateTimeFormat("en-IN", {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(new Date(student.dob))}
            </dd>
          </div>
        </dl>
      </section>
    </Shell>
  );
}
