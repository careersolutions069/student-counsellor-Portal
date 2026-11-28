export const dynamic = "force-dynamic";
import { requireStaff } from "@/lib/auth";
import { Shell, PageTitle } from "@/components/shell";
import { CallingAdmin, type CallerActivity } from "@/components/calling-admin";
import { CallerAlerts, InterestedFollowups, type CallerAlert, type Followup } from "@/components/calling-followups";

export default async function Page() {
  const { client, staff } = await requireStaff(["centre_head"]);
  const [activity, branch] = await Promise.all([
    client.rpc("caller_activity"),
    client.from("branches").select("name,manual_calling").eq("id", staff.branch_id!).single(),
  ]);
  if (activity.error || !activity.data) throw new Error("Unable to load calling activity.");
  const manual = Boolean(branch.data?.manual_calling);
  const [manualToday, followups, alerts] = manual
    ? await Promise.all([
        client.rpc("manual_activity").then((r) => r.data),
        client.rpc("interested_followups").then((r) => (r.data || []) as Followup[]),
        client.from("caller_alerts").select("id,caller_id,numbers_viewed,window_start,updated_at").is("reviewed_at", null).order("updated_at", { ascending: false }).limit(20).then((r) => (r.data || []) as CallerAlert[]),
      ])
    : [null, [] as Followup[], [] as CallerAlert[]];
  const names = Object.fromEntries((activity.data as CallerActivity).callers.map((c) => [c.id, c.full_name]));
  const tab = (key: string, label: string) => ({ href: `/branch?tab=${key}&page=1`, label, current: false });
  return (
    <Shell
      name={staff.full_name}
      role="Centre Head"
      branch={branch.data?.name}
      nav={[
        tab("students", "Students & Enquiries"),
        tab("staff", "Branch Staff"),
        tab("appointments", "F2F Appointments"),
        { href: "/branch/calling", label: "Calling desk", current: true },
        tab("history", "Student Transfers"),
      ]}
    >
      <PageTitle eyebrow={branch.data?.name || "Your branch"} title="Calling desk" text="Daily targets, today’s calls and leads held out of calling." />
      {manual && <CallerAlerts alerts={alerts} names={names} />}
      {manual && <InterestedFollowups items={followups} />}
      <CallingAdmin manual={manual} manualToday={manualToday || {}} activity={activity.data as CallerActivity} />
    </Shell>
  );
}
