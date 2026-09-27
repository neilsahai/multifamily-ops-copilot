/**
 * Deterministic fallback used when no LLM key is configured (or a live call
 * fails). It answers the preset questions with fixed templates over the same
 * read-only tools and passes through the same grounding step. It is always
 * labeled as a fallback and never presented as a model answer.
 */
import type { Dataset } from "@/data/types";
import type { EvidencePacket } from "@/lib/analytics";
import { groundResponse, type CopilotFinding, type CopilotNextStep, type CopilotResponse, type GroundingReport } from "./contract";
import { newGroundingContext, runTool, type ToolCallRecord } from "./agent";
import type { PresetId } from "./presets";

type Flagged = {
  residentId: string;
  name: string;
  unit: string;
  leaseId: string;
  leaseEnd: string;
  daysToLeaseEnd: number;
  triggers: string[];
  reasons: string[];
  priority: { label: string; score: number };
  openWorkOrders: { id: string; category: string; summary: string; ageDays: number }[];
  lowFeedback: { id: string; rating: number }[];
  renewalOutreach: string;
  availableActions: ("draft_maintenance_escalation" | "draft_feedback_follow_up")[];
};

type Metrics = {
  neighborhood: string;
  review: { needsReview: boolean; reasons: string[] };
  renewalRate: { display: string; leaseIds: string[] };
  openWorkOrders: { count: number; ids: string[] };
  medianOpenWorkOrderAge: { display: string };
};

export const FALLBACK_NOTE =
  "Deterministic fallback: this answer was produced by fixed templates over the evidence tools, not by a language model. Live copilot mode requires the LLM_API_KEY environment variable on the server.";

function nextStepFor(f: Flagged): CopilotNextStep {
  const wo = f.openWorkOrders[0];
  if (wo && f.availableActions.includes("draft_maintenance_escalation")) {
    return {
      step: `Review a maintenance escalation for ${f.name} (Unit ${f.unit}): ${wo.id} (${wo.category}) has been open ${wo.ageDays} days.`,
      action: "draft_maintenance_escalation",
      residentId: f.residentId,
      sourceIds: [wo.id, f.leaseId],
    };
  }
  const fb = f.lowFeedback[0];
  return {
    step: `Review a feedback follow-up for ${f.name} (Unit ${f.unit}): feedback ${fb?.id} was rated ${fb?.rating}/5 and no open work order is linked.`,
    action: fb ? "draft_feedback_follow_up" : "none",
    residentId: fb ? f.residentId : "",
    sourceIds: [fb?.id, f.leaseId].filter(Boolean) as string[],
  };
}

export function runFallback(opts: {
  presetId: PresetId | null;
  propertyId: string;
  data: Dataset;
  asOfDate: string;
}): { response: CopilotResponse; report: GroundingReport; toolCalls: ToolCallRecord[] } {
  const { presetId, propertyId, data, asOfDate } = opts;
  const ctx = newGroundingContext(data, asOfDate, propertyId);
  const toolCalls: ToolCallRecord[] = [];
  const call = <T,>(name: string, input: unknown): T => {
    const r = runTool(name, input, data, asOfDate, ctx);
    toolCalls.push({ name, input, ok: r.ok });
    return JSON.parse(r.content) as T;
  };

  let raw: CopilotResponse;

  if (!presetId) {
    raw = {
      answer:
        "The deterministic fallback can only answer the preset questions. Free-form questions need live copilot mode, which is not configured on this server.",
      findings: [
        {
          statement: "This question was not answered: no language model is configured, and no fixed template covers it.",
          kind: "insufficient_evidence",
          sourceIds: [],
        },
      ],
      sourceIds: [],
      recommendedNextSteps: [],
      caveats: ["Choose a preset question, or set LLM_API_KEY to enable live copilot mode."],
      confidence: "low",
    };
    return { ...groundResponse(raw, ctx), toolCalls };
  }

  const metrics = call<Metrics>("get_property_metrics", { propertyId });
  const packet = call<EvidencePacket>("get_evidence_packet", { propertyId });
  const flagged = call<Flagged[]>("get_flagged_residents", { propertyId });
  const place = metrics.neighborhood;
  const claim = (id: string) => packet.claims.find((c) => c.id === id)!;
  const ids = (id: string) => [...new Set(claim(id).sources.flatMap((g) => g.ids))];
  const withOpen = flagged.filter((f) => f.openWorkOrders.length > 0);
  const feedbackOnly = flagged.filter((f) => f.openWorkOrders.length === 0);

  switch (presetId) {
    case "why_flagged": {
      const findings: CopilotFinding[] = metrics.review.needsReview
        ? [
            { statement: `Review rule: ${metrics.review.reasons.join("; ")}.`, kind: "fact", sourceIds: metrics.renewalRate.leaseIds },
            { statement: claim("renewal-rate-vs-portfolio").statement, kind: "fact", sourceIds: ids("renewal-rate-vs-portfolio") },
            ...(packet.support.hvacSlower
              ? [{ statement: claim("hvac-age-vs-portfolio").statement, kind: "fact" as const, sourceIds: ids("hvac-age-vs-portfolio") }]
              : []),
            { statement: `Median open work-order age is ${metrics.medianOpenWorkOrderAge.display} across ${metrics.openWorkOrders.count} open work orders.`, kind: "fact", sourceIds: metrics.openWorkOrders.ids },
          ]
        : [{ statement: `${place} does not meet the property review rule as of the dataset date.`, kind: "fact", sourceIds: metrics.renewalRate.leaseIds }];
      raw = {
        answer: metrics.review.needsReview
          ? `${place} is flagged because it meets the property review rule: ${metrics.review.reasons.join("; ")}. These are measured gaps against the other properties, not an explanation of why they occur.`
          : `${place} is not flagged for review; it does not meet the renewal-gap or open-work-order thresholds.`,
        findings,
        sourceIds: [],
        recommendedNextSteps: [],
        caveats: ["The review rule compares this property with all other properties pooled; it does not establish a cause."],
        confidence: "high",
      };
      break;
    }
    case "who_first": {
      const top = flagged.slice(0, 3);
      raw = {
        answer: flagged.length
          ? `${flagged.length} residents meet the flag rule. By the transparent priority points, start with ${top.map((f) => `${f.name} (${f.priority.label}, ${f.priority.score} points)`).join(", ")}.`
          : `No residents at ${place} meet the flag rule as of the dataset date.`,
        findings: top.map((f) => ({
          statement: `${f.name}, Unit ${f.unit}: ${f.reasons.join("; ")}. Lease ends ${f.leaseEnd}; renewal outreach: ${f.renewalOutreach}.`,
          kind: "fact" as const,
          sourceIds: [f.leaseId, ...f.openWorkOrders.map((o) => o.id), ...f.lowFeedback.map((x) => x.id)],
        })),
        sourceIds: [],
        recommendedNextSteps: top.map(nextStepFor),
        caveats: ["Priority points order follow-up; they are not a prediction of who will decline."],
        confidence: "high",
      };
      break;
    }
    case "verify_before_outreach": {
      raw = {
        answer: flagged.length
          ? `Before renewal outreach, confirm the status of ${withOpen.flatMap((f) => f.openWorkOrders).length} open work orders for ${withOpen.length} residents, and follow up on the feedback concerns of ${feedbackOnly.length} residents who have no open work order. The records show open tickets and low ratings; they do not show whether the problems are still happening today.`
          : `No flagged residents at ${place}; standard renewal outreach checks apply.`,
        findings: [
          ...withOpen.map((f) => ({
            statement: `${f.name}: ${f.openWorkOrders.map((o) => `${o.id} (${o.summary}) open ${o.ageDays} days`).join("; ")}.`,
            kind: "fact" as const,
            sourceIds: f.openWorkOrders.map((o) => o.id),
          })),
          ...feedbackOnly.map((f) => ({
            statement: `${f.name}: flagged for low feedback (${f.lowFeedback.map((x) => `${x.id} rated ${x.rating}/5`).join(", ")}) with no open work order; the concern may not be a maintenance ticket.`,
            kind: "fact" as const,
            sourceIds: f.lowFeedback.map((x) => x.id),
          })),
          ...(flagged.length
            ? [{
                statement: "Whether each issue is currently resolved is not in the records; confirm directly before outreach.",
                kind: "insufficient_evidence" as const,
                sourceIds: [],
              }]
            : []),
        ],
        sourceIds: [],
        recommendedNextSteps: flagged.map(nextStepFor),
        caveats: ["Suggested drafts must be opened, edited and approved by a manager; nothing is sent."],
        confidence: "high",
      };
      break;
    }
    case "maintenance_association": {
      const split = claim("renewal-by-maintenance-history");
      const s = packet.support;
      const findings: CopilotFinding[] = [
        { statement: split.statement, kind: "association", sourceIds: ids("renewal-by-maintenance-history") },
      ];
      if (!s.maintenanceSplitSufficient) {
        findings.push({ statement: split.caveat ?? "Groups are too small to compare.", kind: "insufficient_evidence", sourceIds: [] });
      }
      if (s.hvacSlower) {
        findings.push({ statement: claim("hvac-age-vs-portfolio").statement, kind: "fact", sourceIds: ids("hvac-age-vs-portfolio") });
      }
      raw = {
        answer: s.repeatMaintenanceRenewsLower
          ? `Yes, as an association: at ${place}, residents with 2+ recent work orders renewed less often than other residents (${split.subject.basis} vs ${split.comparison?.basis}). The groups are small, and an association is not evidence of cause.`
          : s.maintenanceSplitSufficient
            ? `No. At ${place}, residents with 2+ recent work orders did not renew at a lower rate (${split.subject.basis} vs ${split.comparison?.basis}).`
            : `The data is insufficient to say: the maintenance-history groups at ${place} are below the minimum size for comparison.`,
        findings,
        sourceIds: [],
        recommendedNextSteps: [],
        caveats: [split.caveat ?? "", "Pricing and other factors are not in this dataset and have not been ruled out."].filter(Boolean),
        confidence: s.repeatMaintenanceRenewsLower ? "medium" : "low",
      };
      break;
    }
  }
  return { ...groundResponse(raw, ctx), toolCalls };
}
