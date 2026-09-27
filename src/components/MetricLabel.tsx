import { METRICS, type MetricId } from "@/lib/semantic";
import { InfoTip } from "./InfoTip";

/** Metric name plus a tooltip rendered straight from the semantic layer. */
export function MetricLabel({ id, children }: { id: MetricId; children?: React.ReactNode }) {
  const m = METRICS[id];
  return (
    <span className="inline-flex items-center gap-1.5">
      {children ?? m.label}
      <InfoTip label={m.label}>
        <span className="block font-semibold">{m.label}</span>
        <span className="mt-1 block">= {m.formula}</span>
        <span className="mt-1 block text-white/75">{m.window}</span>
        {m.notes && <span className="mt-1 block text-white/75">{m.notes}</span>}
      </InfoTip>
    </span>
  );
}
