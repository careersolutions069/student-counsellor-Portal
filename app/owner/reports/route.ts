import {NextRequest,NextResponse} from 'next/server';
import {loadOwnerReport} from '@/lib/owner-report-data';
import {requireStaff} from '@/lib/auth';
import {branchReportCsv,reportFilters} from '@/lib/owner-reports';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
 await requireStaff(['owner']);
 const query=Object.fromEntries(request.nextUrl.searchParams);
 try{reportFilters(query);}catch{return NextResponse.json({error:'Choose a valid branch and date range.'},{status:400,headers:{'Cache-Control':'private, no-store'}});}
 const {report}=await loadOwnerReport(query);
 return new NextResponse(branchReportCsv([...report.branches,report.total]),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="career-solution-branch-report.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
