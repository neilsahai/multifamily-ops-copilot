"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CopilotFinding, CopilotNextStep, FindingKind } from "@/lib/copilot/contract";
import { MAX_QUESTION_LENGTH, PRESETS, type PresetId } from "@/lib/copilot/presets";
import type { CopilotApiResult, CopilotStatus } from "@/lib/copilot/service";
import { SourceIds } from "./SourceIds";
import { Badge, Button, Card, Chevron, Eyebrow } from "./ui";

const KIND: Record<FindingKind, { label: string; tone: "neutral" | "accent" | "warn" | "risk" }> = {
  fact: { label: "Fact", tone: "neutral" },
  association: { label: "Association", tone: "warn" },
  recommendation: { label: "Recommendation", tone: "accent" },
  insufficient_evidence: { label: "Insufficient evidence", tone: "risk" },
};

const ACTION_LABEL = {
  draft_maintenance_escalation: { text: "Open maintenance escalation draft", param: "escalation" },
  draft_feedback_follow_up: { text: "Open feedback follow-up draft", param: "feedback" },
} as const;

function Sources({ ids, label = "Sources" }: { ids: string[]; label?: string }) {
  if (ids.length === 0) return <p className="mt-1 text-xs text-ink-faint">No verified source records.</p>;
  return (
    <details className="mt-1 text-xs">
      <summary className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-strong">
        <Chevron /> {label} ({ids.length})
      </summary>
      <div className="mt-1">
        <SourceIds ids={ids} initial={8} />
      </div>
    </details>
  );
}

function Finding({ f }: { f: CopilotFinding }) {
  const k = KIND[f.kind];
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={k.tone}>{k.label}</Badge>
        {f.supported === false && <Badge tone="risk">Unsupported: no verified source</Badge>}
      </div>
      <p className="mt-1 text-sm leading-relaxed">{f.statement}</p>
      <Sources ids={f.sourceIds} />
    </li>
  );
}

function NextStep({ s, residentNames }: { s: CopilotNextStep; residentNames: Record<string, string> }) {
  const action = s.action !== "none" ? ACTION_LABEL[s.action] : null;
  return (
    <li className="py-2.5">
      <p className="text-sm leading-relaxed">{s.step}</p>
      {action && s.residentId && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Link
            href={`/residents/${s.residentId}?draft=${action.param}`}
            className="inline-flex items-center rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-sm font-medium hover:bg-sunken"
          >
            {action.text}
            {residentNames[s.residentId] ? ` · ${residentNames[s.residentId]}` : ""} →
          </Link>
          <span className="text-xs text-ink-faint">Opens the existing form. Nothing is created until you approve it.</span>
        </div>
      )}
      <Sources ids={s.sourceIds} />
    </li>
  );
}

export function CopilotPanel({
  propertyId,
  neighborhood,
  residentNames,
}: {
  propertyId: string;
  neighborhood: string;
  residentNames: Record<string, string>;
}) {
  const [status, setStatus] = useState<CopilotStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<CopilotApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/copilot")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: CopilotStatus | null) => active && setStatus(s))
      .catch(() => active && setStatus(null));
    return () => {
      active = false;
    };
  }, []);

  const ask = async (payload: { presetId?: PresetId; question?: string }, label: string) => {
    setPending(label);
    setError(null);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, ...payload }),
      });
      const body = await res.json();
      if (!res.ok && !body.response) throw new Error(body.error ?? `Request failed (${res.status})`);
      setResult(body as CopilotApiResult);
    } catch (e) {
      setError((e as Error).message || "The copilot request failed.");
    } finally {
      setPending(null);
    }
  };

  const live = result ? result.mode === "live" : status?.mode === "live";

  return (
    <Card aria-labelledby="copilot-h" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Operations copilot</Eyebrow>
          <h2 id="copilot-h" className="mt-1 font-semibold">Ask about the evidence</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Answers come only from the read-only evidence tools behind this page. Every finding lists the records it cites.
            The copilot can suggest a draft, but only you can open, edit and approve it.
          </p>
        </div>
        {status &&
          (live ? (
            <Badge tone="accent">Live model · {status.model}</Badge>
          ) : (
            <Badge tone="warn" wrap>Deterministic fallback mode</Badge>
          ))}
      </div>
      {status && status.mode === "fallback" && !result && (
        <p className="mt-2 text-xs leading-relaxed text-warn">{status.note}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Preset questions">
        {PRESETS.map((p) => {
          const q = p.question(neighborhood);
          return (
            <button
              key={p.id}
              type="button"
              disabled={pending !== null}
              onClick={() => ask({ presetId: p.id }, q)}
              className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-left text-sm hover:bg-sunken disabled:opacity-50"
            >
              {q}
            </button>
          );
        })}
      </div>

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) ask({ question: question.trim() }, question.trim());
        }}
      >
        <label htmlFor="copilot-q" className="sr-only">Ask your own question</label>
        <input
          id="copilot-q"
          value={question}
          maxLength={MAX_QUESTION_LENGTH}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={live ? "Ask your own question…" : "Your own question (live mode only)"}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
        <Button type="submit" disabled={pending !== null || !question.trim()}>Ask</Button>
      </form>

      <div aria-live="polite" className="mt-4">
        {pending && (
          <p className="animate-pulse rounded-lg bg-sunken px-3 py-3 text-sm text-ink-muted">
            {live ? "Consulting the evidence tools…" : "Building the fallback answer…"} <span className="sr-only">{pending}</span>
          </p>
        )}
        {error && !pending && <p role="alert" className="rounded-lg border border-risk/30 bg-risk-soft px-3 py-2 text-sm text-risk">{error}</p>}

        {result && !pending && (
          <article className="rounded-xl border border-line bg-canvas/60 p-4">
            <div
              className={
                result.mode === "live"
                  ? "rounded-lg border border-accent/25 bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent-strong"
                  : "rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn"
              }
            >
              <strong>{result.mode === "live" ? `AI-generated · ${result.model}` : "Not a model response · deterministic fallback"}</strong>
              {result.cached ? " · cached" : ""}. {result.note}
            </div>

            <p className="mt-3 text-xs font-medium text-ink-faint">Q: {result.question}</p>
            <p className="mt-1 text-[15px] leading-relaxed">{result.response.answer}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={result.response.confidence === "high" ? "accent" : result.response.confidence === "medium" ? "warn" : "risk"}>
                Confidence: {result.response.confidence}
              </Badge>
              <Sources ids={result.response.sourceIds} label="All cited records" />
            </div>

            {result.response.findings.length > 0 && (
              <section className="mt-4">
                <h3 className="text-sm font-semibold">Findings</h3>
                <ul className="divide-y divide-line">{result.response.findings.map((f, i) => <Finding key={i} f={f} />)}</ul>
              </section>
            )}

            {result.response.recommendedNextSteps.length > 0 && (
              <section className="mt-3">
                <h3 className="text-sm font-semibold">Recommended next steps <span className="font-normal text-ink-faint">(suggestions only)</span></h3>
                <ul className="divide-y divide-line">
                  {result.response.recommendedNextSteps.map((s, i) => <NextStep key={i} s={s} residentNames={residentNames} />)}
                </ul>
              </section>
            )}

            {result.response.caveats.length > 0 && (
              <section className="mt-3 rounded-lg border border-warn/25 bg-warn-soft/60 px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-warn">Caveats</h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-ink-muted">
                  {result.response.caveats.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </section>
            )}

            <details className="mt-3 text-xs text-ink-muted">
              <summary className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-strong">
                <Chevron /> Tools used ({result.toolCalls.length}) and grounding checks
              </summary>
              <ul className="mt-1 space-y-0.5 font-mono">
                {result.toolCalls.map((t, i) => (
                  <li key={i}>
                    {t.ok ? "✓" : "✗"} {t.name}({JSON.stringify(t.input)})
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                Citations removed: {result.grounding.removedSourceIds.length} · unsupported findings:{" "}
                {result.grounding.unsupportedFindings} · unverified figures: {result.grounding.ungroundedFigures.length} · causal
                wording flags: {result.grounding.causalPhrases.length} · suggested actions removed: {result.grounding.coercedActions}
              </p>
            </details>
          </article>
        )}
      </div>
    </Card>
  );
}
