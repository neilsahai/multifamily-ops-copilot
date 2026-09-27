import type { TimelineEvent, TimelineKind } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { cx } from "./ui";

const KIND: Record<TimelineKind, { label: string; dot: string }> = {
  lease_start: { label: "Lease", dot: "bg-ink-faint" },
  lease_end: { label: "Lease", dot: "bg-ink-faint" },
  renewal_decision: { label: "Renewal", dot: "bg-accent" },
  work_order_created: { label: "Work order", dot: "bg-risk" },
  work_order_resolved: { label: "Work order", dot: "bg-accent" },
  feedback: { label: "Feedback", dot: "bg-warn" },
  interaction: { label: "Outreach", dot: "bg-ink-muted" },
};

export function Timeline({ events, asOfDate }: { events: TimelineEvent[]; asOfDate: string }) {
  const past = events.filter((e) => e.date <= asOfDate);
  const future = events.filter((e) => e.date > asOfDate);
  return (
    <ol className="relative ml-2 border-l border-line">
      {past.map((e, i) => <Item key={`${e.sourceId}-${e.kind}-${i}`} e={e} />)}
      <li className="relative -ml-2 my-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
        <span aria-hidden className="size-4 rounded-full border-2 border-accent bg-surface" />
        Dataset date · {formatDate(asOfDate)}
      </li>
      {future.map((e, i) => <Item key={`${e.sourceId}-${e.kind}-f${i}`} e={e} upcoming />)}
    </ol>
  );
}

function Item({ e, upcoming }: { e: TimelineEvent; upcoming?: boolean }) {
  const k = KIND[e.kind];
  const open = e.kind === "work_order_created";
  return (
    <li className={cx("relative pb-4 pl-5", upcoming && "opacity-80")}>
      <span aria-hidden className={cx("absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4 ring-surface", k.dot)} />
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-faint">
        <time dateTime={e.date} className="font-medium text-ink-muted">{formatDate(e.date)}</time>
        <span>{k.label}{upcoming ? " · upcoming" : ""}</span>
        <code className="font-mono text-[11px]">{e.sourceId}</code>
      </div>
      <p className={cx("text-sm font-medium", open && "text-ink")}>{e.title}</p>
      {e.detail && <p className={cx("text-sm text-ink-muted", e.kind === "feedback" && "italic")}>{e.kind === "feedback" ? `“${e.detail}”` : e.detail}</p>}
    </li>
  );
}
