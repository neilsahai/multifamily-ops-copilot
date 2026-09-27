"use client";

import { addDays, formatDate } from "@/lib/dates";
import { fmtPct } from "@/lib/format";
import { Badge, Card, Eyebrow } from "./ui";
import { useDemoState } from "./useDemoState";

export interface MeasurementInputs {
  asOfDate: string;
  propertyLabel: string;
  baseline: { renewed: number; denominator: number; value: number | null };
  flaggedIds: string[];
  flaggedWithOpenWorkOrders: number;
}

export function MeasurementPlan({ asOfDate, propertyLabel, baseline, flaggedIds, flaggedWithOpenWorkOrders }: MeasurementInputs) {
  const [state] = useDemoState();
  const escalated = new Set(state.tasks.filter((t) => flaggedIds.includes(t.residentId)).map((t) => t.residentId)).size;

  const rows: { metric: string; value: string; note: string }[] = [
    {
      metric: "Baseline renewal rate",
      value: `${fmtPct(baseline.value)} (${baseline.renewed} of ${baseline.denominator})`,
      note: `${propertyLabel}, decisions in the 90 days to ${formatDate(asOfDate)}`,
    },
    { metric: "Flagged residents (cohort)", value: String(flaggedIds.length), note: "Pending renewals meeting the flag rule" },
    { metric: "Follow-ups approved", value: `${escalated} of ${flaggedIds.length}`, note: "Flagged residents with a simulated escalation or feedback follow-up in this browser" },
    {
      metric: "Issues resolved before renewal decision",
      value: "Not tracked in this prototype",
      note: `In a pilot: compare work-order resolution dates with renewal decision dates for the ${flaggedWithOpenWorkOrders} flagged residents with an open work order today`,
    },
    { metric: "Renewal outcome at +30 days", value: "Not yet observed", note: `Check on ${formatDate(addDays(asOfDate, 30))}` },
    { metric: "Renewal outcome at +60 days", value: "Not yet observed", note: `Check on ${formatDate(addDays(asOfDate, 60))}` },
  ];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Measurement plan</Eyebrow>
          <h2 className="mt-1 font-semibold">How the intervention would be evaluated</h2>
        </div>
        <Badge tone="warn">Impact not yet measured</Badge>
      </div>
      <dl className="mt-4 divide-y divide-line text-sm">
        {rows.map((r) => (
          <div key={r.metric} className="grid gap-1 py-2 sm:grid-cols-[1.2fr_1fr_1.6fr] sm:gap-4">
            <dt className="font-medium">{r.metric}</dt>
            <dd className="tabular-nums">{r.value}</dd>
            <dd className="text-xs text-ink-faint sm:text-sm">{r.note}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        In a pilot, compare flagged residents whose issues were resolved before their decision with those whose were not, and
        with similar residents at other properties. Groups are small, so treat early results as directional rather than
        proof that the intervention changed renewals.
      </p>
    </Card>
  );
}
