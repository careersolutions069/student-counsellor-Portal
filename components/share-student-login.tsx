'use client';
import { useEffect,useState } from 'react';
import { Button } from '@/components/ui/button';
import { loginMessage } from '@/lib/student-documents';
export function ShareStudentLogin({name,registration,phone,origin}:{name:string;registration:string;phone:string;origin:string}) {
 const [portalOrigin,setOrigin]=useState(origin);
 const [notice,setNotice]=useState<{text:string;ok:boolean}|null>(null);
 useEffect(()=>{if(!origin) setOrigin(window.location.origin);},[origin]);
 const message=loginMessage(name,registration,portalOrigin||'http://localhost:3000');
 async function copy() {
  try {await navigator.clipboard.writeText(message);setNotice({text:'✓ Copied login details — paste them into any message.',ok:true});}
  catch {setNotice({text:'Copy didn’t work in this browser. Use Download or Email instead.',ok:false});}
 }
 function download() {
  const url=URL.createObjectURL(new Blob([message],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`${registration}-login.txt`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <div className="space-y-2">
  <div role="group" aria-label="Share student login" className="flex flex-wrap items-center gap-2">
   <span className="mr-1 text-sm font-semibold text-muted">Share student login</span>
   <Button asChild variant="outline"><a href={`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp</a></Button>
   <Button type="button" variant="outline" onClick={copy}>Copy</Button>
   <Button asChild variant="outline"><a href={`mailto:?subject=The%20Career%20Solutions%20Portal%20Login&body=${encodeURIComponent(message)}`}>Email</a></Button>
   <Button type="button" variant="outline" onClick={download}>Download</Button>
  </div>
  <p role="status" className={`min-h-5 text-sm ${notice?.ok===false?'text-danger-text':'text-success'}`}>{notice?.text}</p>
 </div>;
}
