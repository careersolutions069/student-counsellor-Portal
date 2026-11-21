'use client';
import { useEffect,useState } from 'react';
import { Button } from '@/components/ui/button';
import { loginMessage } from '@/lib/student-documents';
export function ShareStudentLogin({name,registration,phone,origin}:{name:string;registration:string;phone:string;origin:string}) {
 const [portalOrigin,setOrigin]=useState(origin);
 const [notice,setNotice]=useState('');
 useEffect(()=>{if(!origin) setOrigin(window.location.origin);},[origin]);
 const message=loginMessage(name,registration,portalOrigin||'http://localhost:3000');
 async function copy() {
  try {await navigator.clipboard.writeText(message);setNotice('Copied!');}
  catch {setNotice('Copy failed. Use Download .txt instead.');}
 }
 function download() {
  const url=URL.createObjectURL(new Blob([message],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`${registration}-login.txt`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section aria-label="Share Student Login" className="mt-5 space-y-3 rounded-xl border border-teal-200 bg-white p-4">
  <h4 className="font-semibold">Share Student Login</h4>
  <p className="text-sm font-medium">{registration}</p>
  <div className="flex flex-wrap gap-2">
   <Button asChild variant="outline"><a href={`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp</a></Button>
   <Button type="button" variant="outline" onClick={copy}>Copy</Button>
   <Button asChild variant="outline"><a href={`mailto:?subject=Career%20Solution%20Portal%20Login&body=${encodeURIComponent(message)}`}>Email</a></Button>
   <Button type="button" variant="outline" onClick={download}>Download .txt</Button>
  </div>
  {notice&&<p role="status" className="text-sm text-teal-900">{notice}</p>}
 </section>;
}
