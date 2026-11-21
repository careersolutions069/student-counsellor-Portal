'use client';
import {startTransition,useActionState,useRef,useState,type FormEvent} from 'react';
import {flushSync} from 'react-dom';
import {prepareUploadForm} from '@/lib/upload-submission';
export function useUploadAction<State>(action:(previous:Awaited<State>,form:FormData)=>Promise<State>,initial:Awaited<State>) {
 const locked=useRef(false);
 const [submitting,setSubmitting]=useState(false);
 const [state,dispatch,pending]=useActionState<State,FormData>(async(previous:Awaited<State>,form:FormData):Promise<State>=>{
  try{return await action(previous,form);}finally{locked.current=false;setSubmitting(false);}
 },initial);
 function onSubmit(event:FormEvent<HTMLFormElement>) {
  if(!event.currentTarget.querySelector('input[type="file"]'))return;
  event.preventDefault();
  if(locked.current||pending)return;
  // Capture successful controls and the file before disabling the fieldset.
  const form=prepareUploadForm(new FormData(event.currentTarget,(event.nativeEvent as SubmitEvent).submitter));
  locked.current=true;
  flushSync(()=>setSubmitting(true));
  startTransition(()=>dispatch(form));
 }
 return [state,dispatch,submitting||pending,onSubmit] as const;
}
