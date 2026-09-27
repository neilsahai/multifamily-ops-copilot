import { FLAG_RULE_TEXT, METRICS, PRIORITY_POINTS, REVIEW_RULE } from "@/lib/semantic";
import { Card, Chevron } from "./ui";

const PRIORITY_LABELS: Record<keyof typeof PRIORITY_POINTS, string> = {
  repeatUnresolvedMaintenance: "Repeat unresolved maintenance (rule A)",
  lowFeedback: "Low feedback rating (rule B)",
  outreachUnanswered: "Renewal outreach unanswered",
  leaseEndsWithin30Days: "Lease ends within 30 days",
  openWorkOrderOver21Days: "A work order has been open more than 21 days",
};

export function HowCalculated() {
  return (
    <Card>
      <details>
        <summary className="flex items-center gap-2 px-4 py-3 font-semibold sm:px-5">
          <Chevron /> How this was calculated
        </summary>
        <div className="grid gap-6 border-t border-line px-4 py-4 text-sm leading-relaxed text-ink-muted sm:px-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-ink">Resident flag rule</h3>
              <p className="mt-1">{FLAG_RULE_TEXT[0]}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>{FLAG_RULE_TEXT[1]}</li>
                <li>{FLAG_RULE_TEXT[2]}</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-ink">Priority order (not a prediction)</h3>
              <p className="mt-1">Flagged residents are ordered by adding transparent points, then by soonest lease end. 4+ points = High, 2–3 = Medium.</p>
              <ul className="mt-1 space-y-0.5">
                {(Object.keys(PRIORITY_POINTS) as (keyof typeof PRIORITY_POINTS)[]).map((k) => (
                  <li key={k} className="flex justify-between gap-4 border-b border-dashed border-line py-0.5">
                    <span>{PRIORITY_LABELS[k]}</span>
                    <span className="tabular-nums text-ink">+{PRIORITY_POINTS[k]}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-ink">Property review rule</h3>
              <p className="mt-1">
                A property is flagged when its trailing-90-day renewal rate is at least {REVIEW_RULE.renewalGapPoints} points below
                all other properties pooled (with at least {REVIEW_RULE.minRenewalDecisions} decisions on each side), or its median
                open work-order age is at least {REVIEW_RULE.openAgeMultiple}× theirs and at least {REVIEW_RULE.openAgeMinDays} days.
              </p>
            </div>
          </div>
          <div>
            <h3 className="font-medium text-ink">Metric definitions</h3>
            <dl className="mt-1 space-y-2">
              {Object.values(METRICS).map((m) => (
                <div key={m.id}>
                  <dt className="font-medium text-ink">{m.label}</dt>
                  <dd>= {m.formula}. {m.window}.{m.notes ? ` ${m.notes}` : ""}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs">
              Dates are compared in UTC against the fixed dataset date, so figures such as “open 24 days” do not change with the
              viewer’s clock. The finding and narrative above are filled from a deterministic template over the evidence packet; no language model writes them. The operations copilot below is separate and labels its own mode.
            </p>
          </div>
        </div>
      </details>
    </Card>
  );
}
