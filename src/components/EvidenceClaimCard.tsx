import type { EvidenceClaim } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { fmtDays, fmtPct } from "@/lib/format";
import { METRICS } from "@/lib/semantic";
import { SourceIds } from "./SourceIds";
import { Card, Chevron } from "./ui";

function display(claim: EvidenceClaim, v: number | null) {
  if (claim.unit === "percent") return fmtPct(v);
  if (claim.unit === "days") return fmtDays(v);
  return v === null ? "N/A" : String(v);
}

export function EvidenceClaimCard({ claim }: { claim: EvidenceClaim }) {
  const def = METRICS[claim.metricId];
  return (
    <Card className="flex flex-col p-4">
      <h3 className="text-sm font-medium text-ink-muted">{claim.title}</h3>
      <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
        <div>
          <p className="text-2xl font-semibold tracking-tight">{display(claim, claim.subject.value)}</p>
          <p className="text-xs text-ink-faint">
            <span className="font-medium text-ink-muted">{claim.subjectLabel}</span> · {claim.subject.basis}
          </p>
        </div>
        {claim.comparison && (
          <div>
            <p className="text-lg font-medium tracking-tight text-ink-muted">
              <span className="sr-only">compared with </span>vs {display(claim, claim.comparison.value)}
            </p>
            <p className="text-xs text-ink-faint">
              <span className="font-medium text-ink-muted">{claim.comparisonLabel}</span> · {claim.comparison.basis}
            </p>
          </div>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed">{claim.statement}</p>
      {claim.caveat && <p className="mt-2 text-xs leading-relaxed text-warn">{claim.caveat}</p>}
      <details className="mt-auto pt-3 text-xs">
        <summary className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-strong">
          <Chevron /> Calculation &amp; source records
        </summary>
        <dl className="mt-2 space-y-1.5 text-ink-muted">
          <div><dt className="inline font-medium text-ink">Formula: </dt><dd className="inline">{def.formula}</dd></div>
          {claim.windows.map((w) => (
            <div key={w.label}>
              <dt className="inline font-medium text-ink">{w.label}: </dt>
              <dd className="inline">{formatDate(w.start)} – {formatDate(w.end)}</dd>
            </div>
          ))}
          {claim.sources.map((g) => (
            <div key={g.label}>
              <dt className="mb-1 font-medium text-ink">{g.label} ({g.ids.length})</dt>
              <dd><SourceIds ids={g.ids} /></dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  );
}
