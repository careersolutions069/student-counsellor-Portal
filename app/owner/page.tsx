export const dynamic = "force-dynamic";
import { StaffDashboard } from "@/components/staff-dashboard";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    branch?: string;
    q?: string;
    stage?: string;
    tab?: string;
    period?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const requested = Number(params.page || 1);
  const page =
    Number.isSafeInteger(requested) && requested > 0 && requested <= 1000000
      ? requested
      : 1;
  return <StaffDashboard role="owner" page={page} filters={params} />;
}
