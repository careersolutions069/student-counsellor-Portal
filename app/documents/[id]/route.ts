import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { documentActor,accessDocument } from '@/lib/document-access';
import { adminClient } from '@/lib/supabase/server';
import { DOCUMENT_BUCKET } from '@/lib/student-documents';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const id=z.uuid().safeParse((await params).id);
 if(!id.success) return NextResponse.json({error:'Document unavailable'},{status:404});
 const actor=await documentActor(request.nextUrl.searchParams.get('as')==='student').catch(()=>null);
 if(!actor) return NextResponse.json({error:'Sign in again'},{status:401,headers:{'Cache-Control':'no-store'}});
 try {
  const doc=await accessDocument(id.data,actor);
  if(!doc.file_path) throw new Error('No file');
  const {data,error}=await adminClient().storage.from(DOCUMENT_BUCKET).createSignedUrl(doc.file_path,60,{download:request.nextUrl.searchParams.get('download')==='1' ? doc.file_name||true : false});
  if(error||!data) throw new Error('File unavailable');
  return NextResponse.redirect(data.signedUrl,{status:303,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 } catch {
  return NextResponse.json({error:'Document unavailable'},{status:404,headers:{'Cache-Control':'no-store'}});
 }
}
