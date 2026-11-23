'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { ADMISSION_STEPS } from '@/lib/student-documents';
const NEXT_HINT=[
 'your counsellor shares the colleges they recommend for you.',
 'your branch checks every document on your list.',
 'your branch submits your college applications.',
 'a college confirms your admission.',
];
export function AdmissionProgress({current}:{current:number}) {
 const router=useRouter();
 useEffect(()=>{
  function refresh() {
   const selectedFile=Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).some(input=>input.files?.length);
   if(document.visibilityState==='visible'&&!selectedFile) router.refresh();
  }
  const timer=setInterval(refresh,30000);
  window.addEventListener('focus',refresh);
  return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[router]);
 const stage=ADMISSION_STEPS[current];
 const last=current===ADMISSION_STEPS.length-1;
 return <section aria-labelledby="progress" className="min-w-0 rounded-[18px] border border-line bg-white p-5 lg:flex-[5_1_380px] lg:rounded-[20px] lg:px-7 lg:py-6">
  <h2 id="progress" className="text-[15px] font-semibold text-muted">Admission progress</h2>
  <p className="mt-1.5 text-sm text-muted">Stage {current+1} of {ADMISSION_STEPS.length}</p>
  <p className="text-[23px] font-bold tracking-[-0.025em] text-navy lg:text-[28px]">{stage}</p>
  <div aria-hidden="true" className="mt-3 grid grid-cols-5 gap-1 lg:hidden">{ADMISSION_STEPS.map((step,index)=><span key={step} className={`h-2 rounded ${index<current?'bg-primary':index===current?'bg-marigold':'bg-line'}`}/>)}</div>
  <ol className="mt-4 flex flex-col gap-2.5 lg:mt-[22px] lg:grid lg:grid-cols-5 lg:gap-1.5">{ADMISSION_STEPS.map((step,index)=>{
   const done=index<current,here=index===current;
   return <li key={step} aria-current={here?'step':undefined} className="flex items-center gap-3 lg:flex-col lg:items-stretch lg:gap-2">
    <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-full lg:h-2 lg:w-auto lg:rounded ${done?'bg-primary text-white':here?'bg-marigold':'bg-line'}`}>{done&&<Check size={14} strokeWidth={3} className="lg:hidden"/>}</span>
    <span className={`flex-1 text-sm leading-tight lg:text-[13px] ${here?'font-bold text-navy':done?'':'text-muted'}`}>{step}</span>
    {(done||here)&&<span className={`text-xs font-semibold ${here?'text-marigold-text':'text-[#0B5650]'}`}>{here?'You are here':'Done'}</span>}
   </li>;})}</ol>
  <p className="mt-5 border-t border-sand pt-4 text-sm text-[#3E4F59] lg:mt-[22px]">{last?'All five stages complete.':<>Next: <strong>{ADMISSION_STEPS[current+1]}</strong> — {NEXT_HINT[current]}</>}</p>
  <p className="sr-only" aria-live="polite">Updates automatically while this page is open.</p>
 </section>;
}
