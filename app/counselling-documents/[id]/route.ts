import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {documentActor} from '@/lib/document-access';
import {adminClient} from '@/lib/supabase/server';
import {DOCUMENT_BUCKET} from '@/lib/student-documents';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
  const id=z.uuid().safeParse((await params).id);
  if(!id.success)return NextResponse.json({error:'Document unavailable'},{status:404,headers});
  const actor=await documentActor(request.nextUrl.searchParams.get('as')==='student').catch(()=>null);
  if(!actor)return NextResponse.json({error:'Sign in again'},{status:401,headers});
  const access=await adminClient().rpc('counselling_document_access',{document_id:id.data,...actor});
  if(access.error||!access.data)return NextResponse.json({error:'Document unavailable'},{status:404,headers});
  const signed=await adminClient().storage.from(DOCUMENT_BUCKET).createSignedUrl(access.data.file_path,60,{download:request.nextUrl.searchParams.get('download')==='1'?access.data.file_name:false});
  if(signed.error||!signed.data)return NextResponse.json({error:'Document unavailable'},{status:404,headers});
  return NextResponse.redirect(signed.data.signedUrl,{status:303,headers});
}
