"use client";

import Link from "next/link";
import { dataset } from "@/data";
import { formatDate } from "@/lib/dates";
import { Badge, Chevron } from "./ui";
import { useDemoState } from "./useDemoState";

const residentById = new Map(dataset.residents.map((r) => [r.id, r]));

export function DemoTaskList({ residentId, propertyId }: { residentId?: string; propertyId?: string }) {
  const [state] = useDemoState();
  const inScope = (rid: string) =>
    (!residentId || rid === residentId) && (!propertyId || residentById.get(rid)?.propertyId === propertyId);
  const tasks = state.tasks.filter((t) => inScope(t.residentId));
  const drafts = state.outreachDrafts.filter((d) => inScope(d.residentId));

  if (tasks.length === 0 && drafts.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-ink-muted sm:px-5">
        No demo tasks or drafts yet. Approved escalations appear here, saved only in this browser.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => {
        const r = residentById.get(t.residentId);
        return (
          <li key={t.id} className="px-4 py-3 text-sm sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-xs text-ink-muted">{t.id}</code>
              <Badge tone="accent">Created · simulated</Badge>
              <Badge tone={t.priority === "Urgent" ? "risk" : t.priority === "High" ? "warn" : "neutral"}>{t.priority}</Badge>
            </div>
            <p className="mt-1 font-medium">{t.title}</p>
            <p className="text-xs text-ink-faint">
              {r && !residentId && (
                <>
                  <Link className="underline underline-offset-2 hover:text-ink" href={`/residents/${r.id}`}>{r.name}</Link> ·{" "}
                </>
              )}
              {t.kind === "feedback_follow_up" ? `Feedback ${t.feedbackId}` : t.workOrderId} · Assignee: {t.assignee} ·{" "}
              {formatDate(t.createdAt)}
            </p>
            <details className="mt-1 text-xs">
              <summary className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-strong">
                <Chevron /> Saved details
              </summary>
              <dl className="mt-1 space-y-1 text-ink-muted">
                <div><dt className="font-medium text-ink">Type</dt><dd>{t.kind === "feedback_follow_up" ? "Feedback follow-up" : "Maintenance escalation"}</dd></div>
                <div><dt className="font-medium text-ink">Reason</dt><dd className="whitespace-pre-wrap">{t.reason || "—"}</dd></div>
                <div><dt className="font-medium text-ink">Notes</dt><dd className="whitespace-pre-wrap">{t.notes || "—"}</dd></div>
              </dl>
            </details>
          </li>
        );
      })}
      {drafts.map((d) => {
        const r = residentById.get(d.residentId);
        return (
          <li key={d.id} className="px-4 py-3 text-sm sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-xs text-ink-muted">{d.id}</code>
              <Badge>Outreach draft · not sent</Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-ink-muted">{d.message}</p>
            <details className="mt-1 text-xs">
              <summary className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-strong">
                <Chevron /> Full message
              </summary>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-sunken p-2 text-ink-muted">{d.message}</p>
            </details>
            <p className="text-xs text-ink-faint">
              {r && !residentId && <>{r.name} · </>}via {d.channel} (if later approved) · {formatDate(d.createdAt)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
