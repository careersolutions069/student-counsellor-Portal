export const dynamic = "force-dynamic";
import { CounsellorDashboard } from "@/components/counsellor-dashboard";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.page || 1);
  const page =
    Number.isSafeInteger(requested) && requested > 0 && requested <= 1000000
      ? requested
      : 1;
  return <CounsellorDashboard tab={params.tab} page={page} />;
}
