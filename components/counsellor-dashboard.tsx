import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { Shell, PageTitle } from "@/components/shell";
import { CallRecord } from "@/components/counsellor-card";
import { Phone } from "lucide-react";
import { dateTime, displayPhone } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NavigationPending } from "@/components/navigation-pending";
import type { CallerLead, CallerBranch } from "@/lib/counsellor";
function timing(lead: CallerLead) {
  const now = Date.now();
  if (lead.queue === "invited" && lead.latest_appointment)
    return { text: `Visit · ${dateTime(lead.latest_appointment.scheduled_at)}`, due: false };
  if (lead.queue === "missed")
    return { text: lead.latest_appointment ? `Missed · ${dateTime(lead.latest_appointment.scheduled_at)}` : "Missed visit", due: true };
  if (lead.callback_at)
    return { text: `Call back · ${dateTime(lead.callback_at)}`, due: new Date(lead.callback_at).getTime() <= now };
  return { text: "New lead · call now", due: false };
}
export async function CounsellorDashboard({
  tab,
  page,
  lead: leadId,
}: {
  tab?: string;
  page: number;
  lead?: string;
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
  const explicit = Boolean(leadId);
  const selected = data.students.find((lead) => lead.id === leadId) || (explicit ? undefined : data.students[0]);
  const backHref = `?tab=${queue}&page=${page}`;
  const leadHref = (id: string) => `${backHref}&lead=${id}`;
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
      {data.students.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:items-start">
          <ul aria-label="Students in this queue" className={`${explicit ? "hidden lg:flex" : "flex"} flex-col gap-2.5`}>
            {data.students.map((lead) => {
              const time = timing(lead);
              // Without an explicit choice the first record opens only on desktop, so highlight it only there.
              const current = selected?.id === lead.id && explicit;
              const desktopDefault = selected?.id === lead.id && !explicit;
              return (
                <li key={lead.id} className={`rounded-[16px] bg-white p-3.5 ${current ? "border-[1.5px] border-primary shadow-[0_2px_10px_rgba(16,47,64,.08)]" : desktopDefault ? "border border-line lg:border-[1.5px] lg:border-primary" : "border border-line"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <strong className="min-w-0 flex-[1_1_11rem] break-words text-[17px] leading-snug text-navy">{lead.full_name}</strong>
                    <span className={`num shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${time.due ? "bg-[#FFF1E0] text-[#9A4A00]" : "bg-teal-soft text-[#0B5650]"}`}>{time.text}</span>
                  </div>
                  <a href={`tel:+91${lead.student_phone}`} className="num mt-1 inline-flex min-h-11 items-center gap-2 text-base font-semibold text-primary">
                    <Phone size={17} aria-hidden="true" />
                    {displayPhone(lead.student_phone)}
                    <span className="sr-only">, call {lead.full_name}</span>
                  </a>
                  <p className="text-[13px] text-muted">{[lead.pipeline_stage, lead.target_course].filter(Boolean).join(" · ")}</p>
                  <Link
                    href={leadHref(lead.id)}
                    aria-current={current ? "true" : undefined}
                    className={`relative mt-2.5 flex min-h-11 items-center justify-center gap-2 rounded-[10px] text-sm font-semibold ${current ? "bg-primary text-white" : "border-[1.5px] border-primary text-primary hover:bg-teal-soft"}`}
                  >
                    {current ? "Record open" : "Open record"}
                    <span className="sr-only"> for {lead.full_name}</span>
                    <span className="absolute right-3"><NavigationPending /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {selected ? (
            <CallRecord key={selected.id} lead={selected} branch={branch.data as CallerBranch} backHref={backHref} hidden={!explicit} />
          ) : (
            <section className="panel space-y-2">
              <p className="font-semibold text-navy">This student is no longer in this queue.</p>
              <p className="text-muted">Their status changed after the last call was saved.</p>
              <Link href={backHref} className="inline-flex min-h-11 items-center font-semibold text-primary">Back to queue</Link>
            </section>
          )}
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
