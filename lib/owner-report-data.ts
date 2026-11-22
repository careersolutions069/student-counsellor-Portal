import 'server-only';
import type {staffClient} from '@/lib/supabase/server';
import {reportFilters,type ReportQuery,type OwnerReport} from '@/lib/owner-reports';
export async function loadOwnerReport(client:Awaited<ReturnType<typeof staffClient>>,query:ReportQuery) {
 const filters=reportFilters(query);
 const {data,error}=await client.rpc('owner_conversion_report',{selected_branch:filters.branch,start_at:filters.start_at,end_at:filters.end_at});
 if(error||!data)throw Error('Unable to load owner reports. Check the filters and try again.');
 return {filters,report:data as OwnerReport};
}
