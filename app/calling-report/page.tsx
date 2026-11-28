import Link from 'next/link';
import {z} from 'zod';
import {notFound} from 'next/navigation';
import {requireStaff} from '@/lib/auth';
import {indiaDayBounds} from '@/lib/validation';
import {Shell,PageTitle} from '@/components/shell';
import {Field} from '@/components/fields';
import {Button} from '@/components/ui/button';
import { ManagerDailyReports, type CallerDailyReport } from '@/components/manager-daily-reports';
import {DailyCallReport} from '@/components/daily-call-report';
import type {CallReport} from '@/lib/daily-call-report';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{caller?:string;date?:string;branch?:string}>}) {
  const {staff,client}=await requireStaff(['centre_head','owner','tele_counsellor']);
  const params=await searchParams;
  const day=params.date||indiaDayBounds().end.slice(0,10);
  const caller=staff.role==='tele_counsellor'?staff.id:params.caller;
  if (!z.iso.date().safeParse(day).success) notFound();
  if (staff.role !== 'tele_counsellor' && !caller) {
    const owner = staff.role === 'owner';
    const selectedBranch = owner ? params.branch || undefined : staff.branch_id || undefined;
    if (selectedBranch && !z.uuid().safeParse(selectedBranch).success) notFound();
    let branchQuery = client.from('branches').select('id,name').order('name');
    if (!owner) branchQuery = branchQuery.eq('id', staff.branch_id!);
    const [team, branches] = await Promise.all([
      client.rpc('manager_daily_reports', {report_day: day, selected_branch: selectedBranch || null}),
      branchQuery,
    ]);
    if (team.error || branches.error) throw new Error('Unable to load daily calling reports.');
    const back = owner ? '/owner' : '/branch';
    return <Shell name={staff.full_name} role={owner ? 'Owner' : 'Centre Head'}
      branch={owner ? undefined : branches.data?.[0]?.name || 'Branch workspace'}
      nav={[{href: back, label: 'Workspace', current: false}, {href: '/calling-report', label: 'Daily Reports', current: true}]}>
      <PageTitle eyebrow="Calling desk" title="Daily Reports" text="Review manual calls logged by each tele-counsellor. Select a caller to see outcomes, campaigns and daily remarks." />
      <ManagerDailyReports reports={team.data as CallerDailyReport[]} day={day}
        selectedBranch={selectedBranch} branches={owner ? branches.data || [] : undefined} />
    </Shell>;
  }
  if (!z.uuid().safeParse(caller).success) notFound();
  const [{data,error}, branch] = await Promise.all([
    client.rpc('daily_call_report',{target:caller,report_day:day}),
    staff.branch_id ? client.from('branches').select('name').eq('id',staff.branch_id).single() : null,
  ]);
  if(error||!data) notFound();
  const back=staff.role==='tele_counsellor'?'/counsellor':`/calling-report?date=${day}`;
  return <Shell branch={staff.branch_id ? branch?.data?.name || 'Branch workspace' : undefined} name={staff.full_name} role={staff.role==='tele_counsellor'?'Tele-counsellor':staff.role==='owner'?'Owner':'Centre Head'}>
    <Link href={back} className="font-semibold text-primary">{staff.role==='tele_counsellor'?'← Back to workspace':'← All daily reports'}</Link>
    <PageTitle eyebrow="Calling desk" title="Daily Calling Report" text="Outcomes recorded by the caller, grouped by India date."/>
    <form className="mb-4 flex items-end gap-2"><input type="hidden" name="caller" value={caller}/><Field type="date" name="date" label="Report date" defaultValue={day} required/><Button>View report</Button></form>
    <DailyCallReport key={caller+day} report={data as CallReport} editable={staff.role==='tele_counsellor'}/>
  </Shell>;
}
