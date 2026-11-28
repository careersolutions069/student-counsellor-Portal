'use server';
import { requireStaff } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { CALL_LABELS, type ManualOutcome } from '@/lib/daily-call-report';
import { z } from 'zod';

export type ManualDesk = {target:number; total:number; lead:null | {id:string; assignment:string; name:string; phone:string; course:string|null; file:string; campaign:string|null}};
const SHOWN=['Choose a visit or a callback, not both.','Choose a future time.','Choose a future callback time'];
export async function logManualCall(lead:string, assignment:string, request:string, outcome:ManualOutcome, remarks:string, callback:string|null, visit:string|null=null) {
  const {client} = await requireStaff(['tele_counsellor']);
  if (!z.uuid().safeParse(lead).success || !z.uuid().safeParse(request).success || !Object.hasOwn(CALL_LABELS,outcome) || typeof remarks!=='string' || remarks.length>2000)
    return {error:'Check the call entry and try again.'};
  const {error} = await client.rpc('save_manual_call',{target:lead,assignment,request_id:request,outcome,remark:remarks,callback_at:callback,visit_at:visit});
  if(error) return {error:SHOWN.includes(error.message)?error.message:'Could not confirm this entry. Check the callback time or refresh to check your assignment.'};
  if(visit||outcome==='interested') revalidatePath('/branch');
  revalidatePath('/counsellor');
  revalidatePath('/calling-report');
  return {success:true};
}
export async function correctOrBook(entry:string, visit:string|null, callback:string|null=null) {
  const {client} = await requireStaff(['tele_counsellor']);
  if(!z.uuid().safeParse(entry).success) return {error:'Refresh and check before retrying.'};
  const {error} = await client.rpc('manual_followup',{entry_id:entry,visit_at:visit,callback_at:callback});
  if(error) return {error:'The entry changed or the selected time is past. Refresh and check before retrying.'};
  for(const path of ['/counsellor','/calling-report','/branch','/owner']) revalidatePath(path);
  return {success:true};
}
export async function saveDailyNote(day:string,note:string) {
  const {client} = await requireStaff(['tele_counsellor']);
  if(!z.iso.date().safeParse(day).success || typeof note!=='string' || note.length>1000) return {error:'Enter up to 1,000 characters.'};
  const {error} = await client.rpc('save_daily_call_note',{report_day:day,daily_note:note});
  if(error) return {error:'Daily note could not be saved. Please retry.'};
  revalidatePath('/calling-report');
  return {success:true};
}
