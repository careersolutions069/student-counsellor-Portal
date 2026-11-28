export const CALL_LABELS = {
  appearing: 'Appearing', interested: 'Interested', busy: 'Busy', callback: 'Call back',
  incoming_unavailable: 'Incoming not available', not_interested: 'Not interested',
  not_reachable: 'Not reachable', no_answer: 'No answer', invalid_number: 'Invalid number',
  switched_off: 'Switched off', admission_taken: 'Taken admission', wrong_number: 'Wrong number', next_year: 'Next year',
};
export type ManualOutcome = keyof typeof CALL_LABELS;
export type CallReport = {
  name: string; date: string; note: string; recipient: string | null;
  groups: {file: string; campaign: string; status: ManualOutcome; count: number}[];
};
export function outcomeLabel(status: ManualOutcome, date: string) {
  const year = Number(date.slice(0,4));
  if (status === 'appearing') return `Appearing ${year}`;
  if (status === 'next_year') return `Next year ${year + 1}`;
  return CALL_LABELS[status];
}
export function reportContent(report: CallReport) {
  const date = new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}).format(new Date(report.date+'T12:00:00+05:30'));
  const subject = `Daily Calling Report – ${report.name} – ${date}`;
  const counts = new Map<ManualOutcome,number>();
  const batches = new Map<string,number>();
  let total = 0;
  for (const g of report.groups) {
    total += g.count;
    counts.set(g.status,(counts.get(g.status) || 0) + g.count);
    const batch = [g.file,g.campaign].filter(Boolean).join(' · ');
    batches.set(batch,(batches.get(batch) || 0) + g.count);
  }
  const rows = (Object.keys(CALL_LABELS) as ManualOutcome[]).map(status => ({label:outcomeLabel(status,report.date),count:counts.get(status) || 0}));
  const files = Array.from(batches, ([name,count])=>({name,count}));
  const text = ['The Career Solutions · Daily Calling Report', `Telecaller: ${report.name}`, `Date: ${date}`,
    ...files.map(f=>`Lead file / campaign: ${f.name} (${f.count})`), `Total calls logged: ${total}`, '',
    ...rows.map(r=>`${r.label}: ${r.count}`), ...(report.note ? ['', 'Additional remarks:',report.note] : [])].join('\n');
  return {subject,date,total,rows,files,text};
}
