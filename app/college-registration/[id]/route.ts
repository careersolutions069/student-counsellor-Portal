import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/server';
import { DOCUMENT_BUCKET } from '@/lib/student-documents';
import type { Student } from '@/components/student-records';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({error: 'PDF unavailable'}, {status: 404});
  const actor = await requireStaff(['owner', 'centre_head']).catch(() => null);
  if (!actor) return NextResponse.json({error: 'Access denied'}, {status: 401, headers: {'Cache-Control': 'no-store'}});
  const result = await actor.client.rpc('managed_students').eq('id', id.data).single();
  const student = result.data as Student | null;
  if (result.error || !student?.college_pdf_path) return NextResponse.json({error: 'PDF unavailable'}, {status: 404, headers: {'Cache-Control': 'no-store'}});
  const signed = await adminClient().storage.from(DOCUMENT_BUCKET).createSignedUrl(student.college_pdf_path, 60, {download: request.nextUrl.searchParams.get('download') === '1' ? student.college_pdf_name || true : false});
  if (signed.error || !signed.data) return NextResponse.json({error: 'PDF unavailable'}, {status: 404});
  return NextResponse.redirect(signed.data.signedUrl, {status: 303, headers: {'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer'}});
}
