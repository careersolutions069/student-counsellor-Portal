import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { Shell, PageTitle } from "@/components/shell";
import { CounsellorCard } from "@/components/counsellor-card";
import { Button } from "@/components/ui/button";
import { NavigationPending } from "@/components/navigation-pending";
import type { CallerLead, CallerBranch } from "@/lib/counsellor";
export async function CounsellorDashboard({
  tab,
  page,
}: {
  tab?: string;
  page: number;
}) {
  const { client, staff } = await requireStaff(["tele_counsellor"]);
  const queue = ["to_call", "invited", "missed"].includes(tab || "")
    ? tab!
    : "to_call";
  const [result, branch] = await Promise.all([
    client.rpc("counsellor_queue", { queue_name: queue, page_number: page }),
    client
      .from("branches")
      .select("id,name,address,google_maps_url")
      .eq("id", staff.branch_id!)
      .single(),
  ]);
  if (result.error || branch.error || !branch.data)
    throw new Error("Unable to load your calling queue.");
  const data = result.data as {
    students: CallerLead[];
    total: number;
    counts: Record<string, number>;
  };
  const tabs = [
    ["to_call", "To Call"],
    ["invited", "Invited"],
    ["missed", "Missed / Re-Invite"],
  ];
  return (
    <Shell
      name={staff.full_name}
      role="Tele-counsellor"
      branch={branch.data.name}
    >
      <PageTitle
        eyebrow={branch.data.name}
        title="Your calling desk"
        text="Call your assigned students, arrange visits and keep every next step clear."
      />
      <nav aria-label="Calling queues" className="grid grid-cols-3 gap-1 rounded-xl bg-sand p-1 sm:max-w-xl">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`?tab=${key}`}
            aria-current={queue === key ? "page" : undefined}
            className={`flex min-h-[52px] flex-col items-center justify-center rounded-[9px] px-1 py-1.5 text-center transition-colors ${queue === key ? "bg-white font-bold text-navy shadow-[0_0_0_1px_#D7CFBF]" : "font-semibold text-[#4A5A64] hover:text-navy"}`}
          >
            <span className="num text-lg font-bold">{data.counts[key] || 0}</span>
            <span className="flex items-center gap-1 text-xs leading-tight">{label}<NavigationPending /></span>
          </Link>
        ))}
      </nav>
      {queue === "to_call" && (
        <p className="text-sm text-muted">
          New enquiries and callbacks due today or overdue. Future callbacks
          appear on their scheduled day.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.students.map((lead) => (
          <CounsellorCard
            key={lead.id}
            lead={lead}
            branch={branch.data as CallerBranch}
          />
        ))}
      </div>
      {data.students.length === 0 && (
        <div className="panel py-12 text-center text-muted">
          {queue === "to_call"
            ? "No calls due right now."
            : queue === "invited"
              ? "No pending invitations."
              : "No missed visits to re-invite."}
        </div>
      )}
      <nav
        aria-label="Calling queue pages"
        className="flex flex-wrap items-center gap-3"
      >
        {page > 1 && (
          <Button asChild variant="outline">
            <Link href={`?tab=${queue}&page=${page - 1}`}>Previous page</Link>
          </Button>
        )}
        {page * 25 < data.total && (
          <Button asChild variant="outline">
            <Link href={`?tab=${queue}&page=${page + 1}`}>Next page</Link>
          </Button>
        )}
        <span className="text-sm text-muted">
          Page {page} · {data.total} students
        </span>
      </nav>
    </Shell>
  );
}
