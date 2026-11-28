import { DailyCallReport } from "@/components/daily-call-report";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/fields";
import type { CallReport } from "@/lib/daily-call-report";

export type CallerDailyReport = CallReport & {
  id: string;
  branchId: string;
  branch: string;
  target: number;
};

type Props = {
  reports: CallerDailyReport[];
  day: string;
  branches?: { id: string; name: string }[];
  selectedBranch?: string;
};

export function ManagerDailyReports({ reports, day, branches, selectedBranch }: Props) {
  const callers = reports.map(report => ({
    report,
    logged: report.groups.reduce((sum, group) => sum + group.count, 0),
  }));
  const total = callers.reduce((sum, caller) => sum + caller.logged, 0);
  return <>
    <form className="panel flex flex-wrap items-end gap-3">
      <Field type="date" name="date" label="Report date (India)" defaultValue={day} required />
      {branches && <Select label="Branch" name="branch" defaultValue={selectedBranch || ""}>
        <option value="">All branches</option>
        {branches.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}
      </Select>}
      <Button>View reports</Button>
    </form>
    <section className="panel space-y-3" aria-label="Caller performance">
      <h2 className="section-title">{total} calls logged</h2>
      {callers.length === 0 && <p>No manual callers or reports for this selection.</p>}
      {callers.map(({report, logged}) => (
        <details key={report.branchId + report.id} className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer py-1 font-semibold">
            {report.name}{branches && ` · ${report.branch}`} · {logged} calls
            <span className="ml-2 text-sm font-normal text-muted">Daily target {report.target}</span>
          </summary>
          <div className="mt-3"><DailyCallReport report={report} editable={false} /></div>
        </details>
      ))}
    </section>
  </>;
}
