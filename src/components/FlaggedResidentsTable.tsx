"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ResidentFlagEvaluation } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { Badge, cx } from "./ui";
import { useDemoState } from "./useDemoState";

type SortKey = "priority" | "leaseEnd" | "openAge";

const SORTS: Record<SortKey, { label: string; compare: (a: ResidentFlagEvaluation, b: ResidentFlagEvaluation) => number }> = {
  priority: { label: "Priority", compare: (a, b) => b.priorityScore - a.priorityScore || a.daysToLeaseEnd - b.daysToLeaseEnd },
  leaseEnd: { label: "Lease end", compare: (a, b) => a.daysToLeaseEnd - b.daysToLeaseEnd },
  openAge: {
    label: "Oldest open work order",
    compare: (a, b) => (b.oldestOpenWorkOrder?.ageDays ?? -1) - (a.oldestOpenWorkOrder?.ageDays ?? -1),
  },
};

export function PriorityBadge({ e }: { e: ResidentFlagEvaluation }) {
  const tone = e.priorityLabel === "High" ? "risk" : e.priorityLabel === "Medium" ? "warn" : "neutral";
  return (
    <Badge tone={tone}>
      {e.priorityLabel} · {e.priorityScore} pts
    </Badge>
  );
}

export function TriggerBadges({ e }: { e: ResidentFlagEvaluation }) {
  return (
    <span className="flex flex-wrap gap-1">
      {e.triggers.includes("repeat_unresolved_maintenance") && <Badge tone="risk">A · Repeat unresolved maintenance</Badge>}
      {e.triggers.includes("low_feedback") && <Badge tone="warn">B · Low feedback</Badge>}
    </span>
  );
}

export function FlaggedResidentsTable({ rows }: { rows: ResidentFlagEvaluation[] }) {
  const [sort, setSort] = useState<SortKey>("priority");
  const [state] = useDemoState();
  const sorted = useMemo(() => [...rows].sort(SORTS[sort].compare), [rows, sort]);
  const escalated = new Set(state.tasks.map((t) => t.residentId));

  if (rows.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-ink-muted">
        No residents meet the flag rule at this property as of the dataset date.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-xs sm:px-5" role="group" aria-label="Sort flagged residents">
        <span className="text-ink-faint">Sort by</span>
        {(Object.keys(SORTS) as SortKey[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={sort === k}
            onClick={() => setSort(k)}
            className={cx(
              "rounded-full border px-2.5 py-0.5 font-medium",
              sort === k ? "border-ink bg-ink text-canvas" : "border-line-strong text-ink-muted hover:bg-sunken",
            )}
          >
            {SORTS[k].label}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-line">
        {sorted.map((e) => (
          <li key={e.resident.id}>
            <Link
              href={`/residents/${e.resident.id}`}
              className="group grid gap-3 px-4 py-3.5 hover:bg-sunken/60 focus-visible:bg-sunken/60 sm:px-5 lg:grid-cols-[minmax(11rem,1.1fr)_minmax(8rem,0.8fr)_minmax(10rem,1fr)_minmax(9rem,0.8fr)_minmax(14rem,1.6fr)] lg:items-start"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink underline-offset-2 group-hover:underline">{e.resident.name}</span>
                  {escalated.has(e.resident.id) && <Badge tone="accent">✓ Demo task</Badge>}
                </div>
                <div className="text-xs text-ink-faint">Unit {e.resident.unit} · {e.resident.id}</div>
                <div className="mt-1"><PriorityBadge e={e} /></div>
              </div>
              <Field label="Lease end">
                {formatDate(e.lease.endDate)}
                <span className="block text-xs text-ink-faint">in {e.daysToLeaseEnd} days · pending</span>
              </Field>
              <Field label="Maintenance (180d)">
                {e.recentWorkOrders.length} work order{e.recentWorkOrders.length === 1 ? "" : "s"}
                <span className="block text-xs text-ink-faint">
                  {e.oldestOpenWorkOrder
                    ? `${e.oldestOpenWorkOrder.workOrder.id} (${e.oldestOpenWorkOrder.workOrder.category}) open ${e.oldestOpenWorkOrder.ageDays}d`
                    : "None open"}
                </span>
              </Field>
              <Field label="Renewal outreach">
                <span className={cx(e.outreach.state === "no_response" && "font-medium text-warn")}>{e.outreach.label}</span>
                {e.outreach.lastContactAt && <span className="block text-xs text-ink-faint">Last {formatDate(e.outreach.lastContactAt)}</span>}
              </Field>
              <Field label="Why flagged">
                <TriggerBadges e={e} />
                <ul className="mt-1 text-xs text-ink-muted">
                  {e.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </Field>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
