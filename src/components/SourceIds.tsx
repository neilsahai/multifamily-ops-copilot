"use client";

import { useState } from "react";

/** Record IDs with a toggle to reveal the complete list. */
export function SourceIds({ ids, initial = 12 }: { ids: string[]; initial?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (ids.length === 0) return <span className="text-xs text-ink-faint">None</span>;
  const shown = expanded ? ids : ids.slice(0, initial);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((id) => (
        <code key={id} className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
          {id}
        </code>
      ))}
      {ids.length > initial && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="rounded px-1 text-xs font-medium text-accent underline underline-offset-2 hover:text-accent-strong"
        >
          {expanded ? "Show fewer" : `Show all ${ids.length}`}
        </button>
      )}
    </span>
  );
}
