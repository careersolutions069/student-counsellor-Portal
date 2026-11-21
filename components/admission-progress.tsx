'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ADMISSION_STEPS } from '@/lib/student-documents';
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
 return <section className="panel" aria-label="Admission progress">
  <h2 className="section-title">Your admission progress</h2>
  <p className="mt-2 text-sm text-slate-500">Current stage: {ADMISSION_STEPS[current]}. Updates automatically while this page is open.</p>
  <ol className="mt-6 grid gap-4 sm:grid-cols-5">{ADMISSION_STEPS.map((step,index)=><li key={step} aria-current={index===current?'step':undefined} className={`flex items-center gap-3 rounded-xl border p-3 text-sm sm:flex-col sm:items-start ${index<=current?'border-teal-200 bg-teal-50 text-teal-950':'border-slate-200 text-slate-500'}`}>
   <span className={`flex size-8 shrink-0 items-center justify-center rounded-full font-semibold ${index<=current?'bg-teal-800 text-white':'bg-slate-100'}`} aria-hidden="true">{index<current?'✓':index+1}</span>
   <span className="font-medium">{step}{index===current&&<span className="sr-only"> · Current stage</span>}</span>
  </li>)}</ol>
 </section>;
}
