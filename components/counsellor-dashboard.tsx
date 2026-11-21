import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { Shell, PageTitle } from "@/components/shell";
import { CounsellorCard } from "@/components/counsellor-card";
import { Button } from "@/components/ui/button";
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
        title="Your calling desk"
        text="Call your assigned students, arrange visits and keep every next step clear."
      />
      <nav aria-label="Calling queues" className="grid gap-2 sm:grid-cols-3">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`?tab=${key}`}
            aria-current={queue === key ? "page" : undefined}
            className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-sm font-semibold ${queue === key ? "border-teal-800 bg-teal-800 text-white" : "border-slate-200 bg-white text-slate-700"}`}
          >
            <span>{label}</span>
            <span className="rounded-md bg-slate-100/20 px-2 py-1">
              {data.counts[key] || 0}
            </span>
          </Link>
        ))}
      </nav>
      {queue === "to_call" && (
        <p className="text-sm text-slate-500">
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
        <div className="panel py-12 text-center text-slate-500">
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
        <span className="text-sm text-slate-500">
          Page {page} · {data.total} students
        </span>
      </nav>
    </Shell>
  );
}
