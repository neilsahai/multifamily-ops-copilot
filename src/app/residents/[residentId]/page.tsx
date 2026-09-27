import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AS_OF_DATE, dataset } from "@/data";
import { DemoTaskList } from "@/components/DemoTaskList";
import { PriorityBadge, TriggerBadges } from "@/components/FlaggedResidentsTable";
import { ResidentActions } from "@/components/ResidentActions";
import { Timeline } from "@/components/Timeline";
import { Badge, Card, cx, Eyebrow } from "@/components/ui";
import { draftEscalation, draftFeedbackFollowUp, draftOutreach } from "@/lib/actions";
import type { TaskInput } from "@/lib/demoState";
import { evaluateResidentFlag, getResidentTimeline } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { FLAG_RULE } from "@/lib/semantic";

type Props = { params: Promise<{ residentId: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return dataset.residents.map((r) => ({ residentId: r.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { residentId } = await params;
  const r = dataset.residents.find((x) => x.id === residentId);
  return { title: r ? `${r.name}, Unit ${r.unit} · Multifamily Ops Intelligence` : "Not found" };
}

export default async function ResidentPage({ params }: Props) {
  const { residentId } = await params;
  const e = evaluateResidentFlag(residentId, dataset, AS_OF_DATE);
  if (!e) notFound();
  const property = dataset.properties.find((p) => p.id === e.resident.propertyId)!;
  const timeline = getResidentTimeline(residentId, dataset);
  const residentLabel = `${e.resident.name}, Unit ${e.resident.unit}`;
  const agedOpen = e.openWorkOrders.find((o) => o.ageDays > FLAG_RULE.openOlderThanDays);

  const checks = [
    {
      label: `Renewal pending and lease ends within ${FLAG_RULE.leaseEndWithinDays} days`,
      met: e.inRenewalWindow,
      detail: `${e.lease.renewalStatus} · ends ${formatDate(e.lease.endDate)} (${e.daysToLeaseEnd >= 0 ? `in ${e.daysToLeaseEnd} days` : `${-e.daysToLeaseEnd} days ago`})`,
    },
    {
      label: `A. ${FLAG_RULE.minWorkOrders}+ work orders in ${FLAG_RULE.maintenanceLookbackDays} days, one open > ${FLAG_RULE.openOlderThanDays} days`,
      met: e.triggers.includes("repeat_unresolved_maintenance"),
      detail: `${e.recentWorkOrders.length} work order${e.recentWorkOrders.length === 1 ? "" : "s"}; ${agedOpen ? `${agedOpen.workOrder.id} open ${agedOpen.ageDays} days` : e.oldestOpenWorkOrder ? `oldest open ${e.oldestOpenWorkOrder.ageDays} days` : "none open"}`,
    },
    {
      label: `B. Feedback rated ${FLAG_RULE.lowRatingMax}/5 or lower in ${FLAG_RULE.feedbackLookbackDays} days`,
      met: e.triggers.includes("low_feedback"),
      detail: e.lowFeedback.length ? e.lowFeedback.map((f) => `${f.id} rated ${f.rating}/5 on ${formatDate(f.createdAt)}`).join("; ") : "No low ratings",
    },
  ];

  // One draft per open work order; resolved tickets are never offered for escalation.
  const escalationDrafts: Record<string, TaskInput> = {};
  for (const { workOrder } of e.openWorkOrders) {
    const d = draftEscalation(e, AS_OF_DATE, workOrder.id);
    if (d) escalationDrafts[workOrder.id] = d;
  }
  const workOrderOptions = e.openWorkOrders.map(({ workOrder: w, ageDays }) => ({
    id: w.id,
    label: `${w.id} · ${w.category} · open ${ageDays} days`,
  }));
  const feedbackFollowUp = draftFeedbackFollowUp(e);
  const outreach = draftOutreach(e);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href="/" className="hover:text-ink hover:underline">Portfolio Operations</Link>
        <span aria-hidden className="mx-2">/</span>
        <Link href={`/properties/${property.id}`} className="hover:text-ink hover:underline">{property.neighborhood}</Link>
        <span aria-hidden className="mx-2">/</span>
        <span aria-current="page">{e.resident.name}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Resident 360 · synthetic record · as of {formatDate(AS_OF_DATE)}</Eyebrow>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {e.resident.name}, <span className="font-normal">Unit {e.resident.unit}</span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{property.name} · {property.neighborhood} · {e.resident.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {e.flagged ? <><Badge tone="warn">⚑ Flagged for follow-up</Badge><PriorityBadge e={e} /></> : <Badge>Not flagged</Badge>}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card className="p-4 sm:p-5">
            <h2 className="font-semibold">Why {e.flagged ? "this resident is flagged" : "this resident is not flagged"}</h2>
            {e.flagged && <div className="mt-2"><TriggerBadges e={e} /></div>}
            <ul className="mt-3 space-y-2">
              {checks.map((c) => (
                <li key={c.label} className="flex gap-3 text-sm">
                  <span aria-hidden className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold", c.met ? "bg-warn-soft text-warn" : "bg-sunken text-ink-faint")}>
                    {c.met ? "✓" : "–"}
                  </span>
                  <div>
                    <p className="font-medium">
                      {c.label} <span className="sr-only">{c.met ? "— met" : "— not met"}</span>
                      <span aria-hidden className={cx("ml-1 text-xs font-normal", c.met ? "text-warn" : "text-ink-faint")}>{c.met ? "Met" : "Not met"}</span>
                    </p>
                    <p className="text-ink-muted">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            {e.flagged && (
              <div className="mt-4 border-t border-line pt-3 text-sm">
                <p className="font-medium">Priority points</p>
                <ul className="mt-1 flex flex-wrap gap-2 text-xs text-ink-muted">
                  {e.priorityFactors.map((f) => (
                    <li key={f.label} className="rounded-md bg-sunken px-2 py-1">{f.label} <span className="font-semibold text-ink">+{f.points}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Timeline</h2>
              <p className="text-xs text-ink-faint">Joined from lease, work-order, feedback and outreach records</p>
            </div>
            <Timeline events={timeline} asOfDate={AS_OF_DATE} />
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <ResidentActions
            residentLabel={residentLabel}
            escalationDrafts={escalationDrafts}
            workOrderOptions={workOrderOptions}
            feedbackFollowUp={feedbackFollowUp}
            outreach={outreach}
            asOfDate={AS_OF_DATE}
            hasOpenServiceIssue={e.openWorkOrders.length > 0}
          />

          <Card className="p-4 sm:p-5">
            <h2 className="font-semibold">Lease</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-xs text-ink-faint">Monthly rent</dt><dd className="font-medium">{fmtMoney(e.lease.monthlyRent)}</dd></div>
              <div><dt className="text-xs text-ink-faint">Renewal status</dt><dd className="font-medium capitalize">{e.lease.renewalStatus}</dd></div>
              <div><dt className="text-xs text-ink-faint">Term</dt><dd>{formatDate(e.lease.startDate)} – {formatDate(e.lease.endDate)}</dd></div>
              <div><dt className="text-xs text-ink-faint">Ends</dt><dd>{e.daysToLeaseEnd >= 0 ? `in ${e.daysToLeaseEnd} days` : `${-e.daysToLeaseEnd} days ago`}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-ink-faint">Renewal outreach</dt><dd className={cx(e.outreach.state === "no_response" && "font-medium text-warn")}>{e.outreach.label}{e.outreach.lastContactAt ? ` · last ${formatDate(e.outreach.lastContactAt)}` : ""}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-ink-faint">Preferred channel</dt><dd className="capitalize">{e.resident.preferences?.contactChannel ?? "Not recorded"}</dd></div>
            </dl>
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <h2 className="font-semibold">Demo tasks &amp; drafts for this resident</h2>
            </div>
            <DemoTaskList residentId={residentId} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
