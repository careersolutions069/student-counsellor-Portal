import { BulkLeadImport } from "@/components/bulk-lead-import";
import { OwnerReports } from "@/components/owner-reports";
import { z } from "zod";
import Link from "next/link";
import { requireStaff, type Role, type Staff } from "@/lib/auth";
import { Shell, PageTitle, Stat } from "@/components/shell";
import { StaffManagement, type Branch } from "@/components/staff-management";
import {
  StudentRecords,
  type Student,
  type Activity,
} from "@/components/student-records";
import { BranchManagement } from "@/components/branch-management";
import { Appointments, type Meeting } from "@/components/appointments";
import type { StudentDocument } from "@/lib/student-documents";
import { History, type Transfer, type HistoryStudent } from "@/components/history";
import { Field, Select } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { StudentTransfer } from "@/components/student-transfer";
import { indiaDayBounds } from "@/lib/validation";
export type DashboardFilters = {
  branch?: string;
  q?: string;
  stage?: string;
  tab?: string;
  period?: string;
  from?: string;
  to?: string;
  appt?: string;
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
export async function StaffDashboard({
  role,
  page = 1,
  filters = {},
}: {
  role: Role;
  page?: number;
  filters?: DashboardFilters;
}) {
  const { client, staff } = await requireStaff([role]);
  const owner = role === "owner";
  const caller = role === "tele_counsellor";
  const parsedBranch = z.uuid().safeParse(filters.branch);
  const selectedBranch = owner
    ? parsedBranch.success
      ? parsedBranch.data
      : null
    : staff.branch_id;
  const tab = caller
    ? "students"
    : [
          "students",
          "staff",
          "appointments",
          "history",
          ...(owner ? ["branches", "reports"] : []),
        ].includes(filters.tab || "")
      ? filters.tab!
      : "students";
  const queryText = (filters.q || "")
    .slice(0, 100)
    .replace(/[%,()"\\]/g, " ")
    .trim();
  const stage = stages.includes(filters.stage || "") ? filters.stage! : "";
  let branchesQuery = client
    .from("branches")
    .select("*")
    .order("name");
  let staffQuery = client.from("staff_profiles").select("*").order("full_name");
  let studentsQuery = client
    .rpc("managed_students", {}, { count: "exact" })
    .select("*")
    .order("created_at", { ascending: false })
    .order("id")
    .range(owner && tab === "history" ? 0 : (page - 1) * 25, owner && tab === "history" ? 24 : page * 25 - 1);
  if (!owner) {
    branchesQuery = branchesQuery.eq("id", staff.branch_id!);
    staffQuery = staffQuery.eq("branch_id", staff.branch_id!);
  }
  if (selectedBranch)
    studentsQuery = studentsQuery.eq("branch_id", selectedBranch);
  if (queryText)
    studentsQuery = studentsQuery.or(
      `full_name.ilike.%${queryText}%,student_phone.ilike.%${queryText}%,parent_phone.ilike.%${queryText}%,registration_number.ilike.%${queryText}%`,
    );
  if (stage && tab === "students") studentsQuery = studentsQuery.eq("pipeline_stage", stage);
  let meetingsQuery = client
    .from("appointments")
    .select("*", { count: "exact" })
    .order("scheduled_at")
    .order("id")
    .range((page - 1) * 25, page * 25 - 1);
  let transferQuery = client
    .from("branch_transfers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 25, page * 25 - 1);
  if (selectedBranch) {
    meetingsQuery = meetingsQuery.eq("branch_id", selectedBranch);
    transferQuery = transferQuery.or(
      `from_branch_id.eq.${selectedBranch},to_branch_id.eq.${selectedBranch}`,
    );
  }
  const [branchResult, staffResult, studentResult, kpiResult, branchCounts, meetingResult, transferResult] =
    await Promise.all([
      branchesQuery,
      tab === "students" || tab === "staff" || tab === "history" || tab === "appointments" ? staffQuery : null,
      tab === "students" || (owner && tab === "history") ? studentsQuery : null,
      client.rpc("dashboard_kpis", { selected_branch: selectedBranch }),
      tab === "branches" ? client.rpc("branch_student_counts") : null,
      tab === "appointments"
        ? meetingsQuery.or(`status.eq.scheduled,scheduled_at.gte.${indiaDayBounds().start}`)
        : null,
      tab === "history" ? transferQuery : null,
    ]);
  if (
    [branchResult, staffResult, studentResult, kpiResult, branchCounts].some((r) => r?.error)
  )
    throw new Error("Unable to load dashboard records.");
  const branches = (branchResult.data || []).map(b => ({...b, students: [{count: Number(branchCounts?.data?.find((c: {branch_id: string}) => c.branch_id === b.id)?.total || 0)}]})) as Branch[];
  const members = (staffResult?.data || []) as Staff[];
  const students = (studentResult?.data || []) as Student[];
  const studentCount = studentResult?.count || 0;
  const kpis = kpiResult.data as {
    total_leads: number;
    f2f_attended: number;
    visit_details_completed: number;
    profiles_completed: number;
    admissions_confirmed: number;
  };
  let calls: Activity[] = [];
  let appointments: Activity[] = [];
  let shortlists: Activity[] = [];
  let documents: StudentDocument[] = [];
  let meetings: Meeting[] = [];
  let transfers: Transfer[] = [];
  let historyStudents: HistoryStudent[] = [];
  let recordCount = studentCount;
  if (tab === "students" && students.length) {
    const ids = students.map((s) => s.id);
    const result = await Promise.all([
      client
        .from("call_logs")
        .select("*")
        .in("student_id", ids)
        .order("created_at", { ascending: false }),
      client
        .from("appointments")
        .select("*")
        .in("student_id", ids)
        .order("scheduled_at"),
      client.from("student_documents").select("*").in("student_id", ids).order("document_name"),
      client
        .from("shortlists_and_admissions")
        .select("*")
        .in("student_id", ids)
        .order("updated_at", { ascending: false }),
    ]);
    if (result.some((r) => r.error))
      throw new Error("Unable to load student activity.");
    documents = (result[2].data || []).map(d=>({...d,has_file:Boolean(d.file_path)})) as StudentDocument[];
    [calls, appointments, shortlists] = [result[0],result[1],result[3]].map((r) => r.data || []) as [
      Activity[],
      Activity[],
      Activity[],
    ];
  }
  if (meetingResult) {
    const result = meetingResult;
    if (result.error) throw new Error("Unable to load appointments.");
    const ids = [...new Set((result.data || []).map(m => m.student_id))];
    const profiles = ids.length ? await client.rpc("managed_students").in("id", ids) : {data: [], error: null};
    if (profiles.error) throw new Error("Unable to load appointment profiles.");
    meetings = (result.data || []).map(m => ({...m, students: (profiles.data as Student[]).find(s => s.id === m.student_id) || null})) as Meeting[];
    recordCount = result.count || 0;
  }
  if (transferResult) {
    const result = transferResult;
    if (result.error) throw new Error("Unable to load transfers.");
    transfers = result.data as Transfer[];
    const ids = [...new Set(transfers.map(t=>t.student_id))];
    if (ids.length) {
      const lookup = await client.from("students").select("id,full_name,registration_number").in("id", ids);
      if (lookup.error) throw new Error("Unable to load transfer names.");
      historyStudents = lookup.data || [];
    }
    recordCount = result.count || 0;
  }
  function href(nextTab = tab, nextPage = 1) {
    const params = new URLSearchParams({
      tab: nextTab,
      page: String(nextPage),
    });
    if (owner && selectedBranch) params.set("branch", selectedBranch);
    if (owner) for (const key of ["period", "from", "to"] as const) if (filters[key]) params.set(key, filters[key]);
    if (nextTab === "students" || nextTab === "history") {
      if (queryText) params.set("q", queryText);
      if (stage && nextTab === "students") params.set("stage", stage);
    }
    return `?${params}`;
  }
  const tabs = [
    ["students", "Students & Enquiries"],
    ["staff", owner ? "Staff" : "Branch Staff"],
    ["appointments", "F2F Appointments"],
    ...(owner ? [["branches", "Branches"], ["reports", "Conversion & Revenue Reports"]] : []),
    ["history", "Student Transfers"],
  ];
  return (
    <Shell
      name={staff.full_name}
      role={owner ? "Owner" : caller ? "Tele-counsellor" : "Centre Head"}
      branch={owner ? undefined : branches.find((b) => b.id === staff.branch_id)?.name}
      nav={caller ? [] : tabs.map(([key, label]) => ({ href: href(key), label, current: tab === key }))}
    >
      <PageTitle
        eyebrow={owner ? "Owner" : branches[0]?.name || "Your branch"}
        title={
          owner
            ? "All-India overview"
            : caller
              ? "Your student enquiries"
              : `${tabs.find(([key]) => key === tab)?.[1] || "Branch overview"}`
        }
        text={
          owner
            ? "Manage branches, people and every student journey."
            : caller
              ? "Follow up with your assigned students and plan their next meeting."
              : "Manage your team, counselling meetings and admissions."
        }
      />
      {owner && (
        <form method="get" aria-label="Global branch filter" className="flex flex-wrap items-end gap-3 rounded-[14px] border-[1.5px] border-navy bg-white p-3.5">
          <input type="hidden" name="tab" value={tab} />
          {tab === "history" && <input type="hidden" name="q" value={queryText} />}
          {["period", "from", "to"].map(key => <input key={key} type="hidden" name={key} value={filters[key as keyof DashboardFilters] || ""} />)}
          <div className="min-w-56 flex-1 [&_select]:bg-teal-soft [&_select]:font-bold [&_select]:text-navy">
            <Select
              label="Showing"
              name="branch"
              defaultValue={selectedBranch || ""}
            >
              <option value="">All Branches ({branches.filter((b) => b.is_active).length} active{branches.some((b) => !b.is_active) ? `, ${branches.filter((b) => !b.is_active).length} inactive` : ""})</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {!b.is_active ? " (inactive)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">Apply branch filter</Button>
        </form>
      )}
      <section aria-label="Key numbers" className={`${tab === "appointments" ? "hidden lg:grid" : "grid"} grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5`}>
        <Stat label="Total Leads" value={kpis.total_leads} />
        <Stat label="Visits Attended" value={kpis.f2f_attended} hint="Student came to the branch" tone="teal" />
        <Stat label="Visit Details Completed" value={kpis.visit_details_completed} hint="Visit form saved by branch" tone="navy" />
        <Stat label="Profiles Completed" value={kpis.profiles_completed} />
        <Stat label="Admissions Confirmed" value={kpis.admissions_confirmed} />
      </section>
      {tab === "students" && (
        <>
          <form
            method="get"
            className="panel grid items-end gap-4 md:grid-cols-[2fr_1fr_auto]"
          >
            <input type="hidden" name="tab" value="students" />
            {owner && (
              <input type="hidden" name="branch" value={selectedBranch || ""} />
            )}
            <Field
              label="Search students"
              name="q"
              defaultValue={queryText}
              placeholder="Name, phone or registration number"
              maxLength={100}
            />
            <Select label="Pipeline stage" name="stage" defaultValue={stage}>
              <option value="">All stages</option>
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Button type="submit">Search</Button>
          </form>
          {!caller && <BulkLeadImport branches={branches} members={members} owner={owner} defaultBranch={selectedBranch || undefined} />}
          <StudentRecords
            students={students}
            branches={branches}
            staff={members}
            role={role}
            calls={calls}
            appointments={appointments}
            shortlists={shortlists}
            documents={documents}
            defaultBranch={selectedBranch || undefined}
          />
        </>
      )}
      {tab === "reports" && owner && <OwnerReports client={client} query={{...filters, branch: selectedBranch || undefined}} />}
      {tab === "staff" && (
        <StaffManagement members={members} branches={branches} owner={owner} />
      )}
      {tab === "branches" && owner && <BranchManagement branches={branches} />}
      {tab === "appointments" && (
        <Appointments
          meetings={meetings}
          selectedId={z.uuid().safeParse(filters.appt).success ? filters.appt : undefined}
          hrefFor={(id) => `${href("appointments", page)}&appt=${id}`}
          backHref={href("appointments", page)}
          staffNames={Object.fromEntries(members.map((m) => [m.id, m.full_name]))}
          branchNames={owner ? Object.fromEntries(branches.map((b) => [b.id, b.name])) : undefined}
        />
      )}
      {tab === "history" && (
        <>
          {owner ? <section className="panel space-y-5"><h2 className="section-title">Transfer student</h2><p className="text-sm text-muted">Find the student, choose an active destination branch, and enter a reason.</p>
            <form method="get" className="flex flex-wrap items-end gap-3"><input type="hidden" name="tab" value="history"/><input type="hidden" name="branch" value={selectedBranch || ""}/><div className="min-w-0 flex-1"><Field label="Find student" name="q" defaultValue={queryText} placeholder="Name, phone or registration number" maxLength={100}/></div><Button type="submit" variant="outline">Find students</Button></form>
            <p className="text-sm text-muted">{studentCount} matching students.{studentCount > 25 ? " Showing the first 25. Refine your search to find another student." : ""}</p>
            <StudentTransfer students={students.map(s=>({id:s.id,branch_id:s.branch_id,full_name:s.full_name,student_phone:s.student_phone,registration_number:s.registration_number}))} branches={branches}/>
          </section> : <section className="panel space-y-3"><h2 className="section-title">Student transfers</h2><p className="text-sm text-[#3E4F59]">Only the Owner can transfer students between branches. Contact the Owner to arrange a transfer. Transfers involving your branch appear below.</p></section>}
          <History transfers={transfers} branches={branches} staff={members} students={historyStudents}/>
        </>
      )}
      {["students", "appointments", "history"].includes(tab) && (
        <nav aria-label="Record pages" className="flex items-center gap-3">
          {page > 1 && (
            <Button asChild variant="outline">
              <Link href={href(tab, page - 1)}>Previous page</Link>
            </Button>
          )}
          {page * 25 < recordCount && (
            <Button asChild variant="outline">
              <Link href={href(tab, page + 1)}>Next page</Link>
            </Button>
          )}
          <span className="text-sm text-muted">
            Page {page} · {recordCount} records
          </span>
        </nav>
      )}
    </Shell>
  );
}
