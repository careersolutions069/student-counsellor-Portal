import Link from 'next/link';
import {z} from 'zod';
import {notFound} from 'next/navigation';
import {requireStaff} from '@/lib/auth';
import {indiaDayBounds} from '@/lib/validation';
import {Shell,PageTitle} from '@/components/shell';
import {Field} from '@/components/fields';
import {Button} from '@/components/ui/button';
import {DailyCallReport} from '@/components/daily-call-report';
import type {CallReport} from '@/lib/daily-call-report';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{caller?:string;date?:string}>}) {
  const {staff,client}=await requireStaff(['centre_head','owner','tele_counsellor']);
  const params=await searchParams;
  const day=params.date||indiaDayBounds().end.slice(0,10);
  const caller=staff.role==='tele_counsellor'?staff.id:params.caller;
  if(!z.iso.date().safeParse(day).success||!z.uuid().safeParse(caller).success) notFound();
  const [{data,error}, branch] = await Promise.all([
    client.rpc('daily_call_report',{target:caller,report_day:day}),
    staff.branch_id ? client.from('branches').select('name').eq('id',staff.branch_id).single() : null,
  ]);
  if(error||!data) notFound();
  const back=staff.role==='tele_counsellor'?'/counsellor':staff.role==='owner'?'/owner':'/branch/calling';
  return <Shell branch={staff.branch_id ? branch?.data?.name || 'Branch workspace' : undefined} name={staff.full_name} role={staff.role==='tele_counsellor'?'Tele-counsellor':staff.role==='owner'?'Owner':'Centre Head'}>
    <Link href={back} className="font-semibold text-primary">← Back to workspace</Link>
    <PageTitle eyebrow="Calling desk" title="Daily Calling Report" text="Outcomes recorded by the caller, grouped by India date."/>
    <form className="mb-4 flex items-end gap-2"><input type="hidden" name="caller" value={caller}/><Field type="date" name="date" label="Report date" defaultValue={day} required/><Button>View report</Button></form>
    <DailyCallReport key={caller+day} report={data as CallReport} editable={staff.role==='tele_counsellor'}/>
  </Shell>;
}
