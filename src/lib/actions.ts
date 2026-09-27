/**
 * Deterministic drafts for manager review. These only pre-fill editable forms;
 * a person must approve before anything is saved, and saving is simulated.
 *
 * Drafts state only what the records show. They never link a complaint to an
 * unrelated work order, and never promise visits or deadline changes that no
 * record supports.
 */
import type { DemoTask, OutreachDraft, WorkOrder } from "@/data/types";
import type { ResidentFlagEvaluation } from "./analytics";
import { formatDate } from "./dates";
import type { TaskInput } from "./demoState";
import { FLAG_RULE } from "./semantic";

const ASSIGNEE_BY_CATEGORY: Record<string, string> = {
  HVAC: "HVAC technician lead (on-site maintenance)",
  Plumbing: "Plumbing technician (on-site maintenance)",
};
const DEFAULT_ASSIGNEE = "Maintenance supervisor";
export const COMMUNITY_MANAGER = "Community manager";

export const ASSIGNEE_OPTIONS = [
  "HVAC technician lead (on-site maintenance)",
  "Plumbing technician (on-site maintenance)",
  "Maintenance supervisor",
  "Regional facilities manager",
  "Third-party HVAC vendor (via supervisor)",
  COMMUNITY_MANAGER,
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function leaseLine(e: ResidentFlagEvaluation): string {
  return `Lease ends ${formatDate(e.lease.endDate)} (${e.daysToLeaseEnd} days); renewal outreach: ${e.outreach.label.toLowerCase()}.`;
}

/** Only work orders still open on the dataset date can be escalated. */
export function escalationCandidates(e: ResidentFlagEvaluation): WorkOrder[] {
  return e.openWorkOrders.map((o) => o.workOrder);
}

/**
 * Escalation for one open work order (defaults to the oldest). Returns null
 * when the resident has no open work order — a resolved or unrelated ticket
 * is never used as a stand-in for a complaint.
 */
export function draftEscalation(
  e: ResidentFlagEvaluation,
  asOfDate: string,
  workOrderId?: string,
): TaskInput | null {
  const open = workOrderId
    ? e.openWorkOrders.find((o) => o.workOrder.id === workOrderId)
    : e.oldestOpenWorkOrder;
  if (!open) return null;
  const { workOrder: target, ageDays } = open;

  const sameCategory = e.recentWorkOrders.filter((w) => w.category === target.category);
  const repeatSameCategory = sameCategory.length >= 2;
  const multiple = e.triggers.includes("repeat_unresolved_maintenance");
  const priority: DemoTask["priority"] =
    multiple && ageDays > 14 ? "Urgent" : multiple && ageDays > FLAG_RULE.openOlderThanDays ? "High" : "Normal";

  const lines: string[] = [];
  if (repeatSameCategory) {
    lines.push(
      `${plural(sameCategory.length, `${target.category} work order`)} since ${formatDate(sameCategory[0].createdAt)} (${sameCategory.map((w) => w.id).join(", ")}).`,
    );
  } else if (e.recentWorkOrders.length >= 2) {
    const cats = [...new Set(e.recentWorkOrders.map((w) => w.category))].join(", ");
    lines.push(
      `${plural(e.recentWorkOrders.length, "maintenance request")} in the past ${FLAG_RULE.maintenanceLookbackDays} days across ${cats} (${e.recentWorkOrders.map((w) => w.id).join(", ")}).`,
    );
  }
  lines.push(`${target.id} (${target.summary}) open ${ageDays} days as of ${formatDate(asOfDate)}.`);
  lines.push(leaseLine(e));

  return {
    kind: "maintenance_escalation",
    residentId: e.resident.id,
    workOrderId: target.id,
    title: repeatSameCategory
      ? `Escalate repeat ${target.category} issue — Unit ${e.resident.unit}`
      : `Escalate open ${target.category} work order — Unit ${e.resident.unit}`,
    priority,
    assignee: ASSIGNEE_BY_CATEGORY[target.category] ?? DEFAULT_ASSIGNEE,
    reason: lines.join(" "),
    notes: repeatSameCategory
      ? "Request root-cause inspection rather than another like-for-like repair. Confirm visit time with the resident."
      : "Confirm status and next visit time with the resident.",
  };
}

/**
 * Manager follow-up tied to a low feedback record. Used for concerns that are
 * not (or not known to be) maintenance tickets, e.g. noise or amenity outages.
 */
export function draftFeedbackFollowUp(e: ResidentFlagEvaluation): TaskInput | null {
  const fb = [...e.lowFeedback].sort((a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt))[0];
  if (!fb) return null;
  return {
    kind: "feedback_follow_up",
    residentId: e.resident.id,
    feedbackId: fb.id,
    title: `Follow up on resident concern (${fb.id}) — Unit ${e.resident.unit}`,
    priority: e.daysToLeaseEnd <= 30 ? "High" : "Normal",
    assignee: COMMUNITY_MANAGER,
    reason: [
      `Resident rated service ${fb.rating}/5 on ${formatDate(fb.createdAt)}: “${fb.text}”`,
      "This feedback is not linked to a work order in the records.",
      leaseLine(e),
    ].join(" "),
    notes:
      "Contact the resident to confirm whether the concern is still unresolved. Open a work order only if it is a maintenance issue.",
  };
}

export function draftOutreach(e: ResidentFlagEvaluation): Pick<OutreachDraft, "residentId" | "channel" | "message"> {
  const first = e.resident.name.split(" ")[0];
  const wo = e.oldestOpenWorkOrder?.workOrder;
  const fb = e.lowFeedback[0];
  const renewal =
    "If you have questions about your renewal offer, I'm happy to talk them through.";

  let body: string[];
  if (wo) {
    const what = wo.category === "HVAC" ? "air-conditioning" : wo.category.toLowerCase();
    body = [
      `I'm following up personally about the open ${what} request for your home (work order ${wo.id}). I'd like to confirm whether it is still unresolved and make sure it is getting the right attention.`,
      `I'll let you know what I find once I've reviewed it with our maintenance team.`,
    ];
  } else if (fb) {
    body = [
      `Thank you for the feedback you shared on ${formatDate(fb.createdAt)}. I'd like to confirm whether this concern is still unresolved and coordinate the appropriate next step.`,
      `Would you be open to a short call, or could you reply with a good time to reach you?`,
    ];
  } else {
    body = [`I wanted to check in and see how things are going in your home.`];
  }

  return {
    residentId: e.resident.id,
    channel: e.resident.preferences?.contactChannel ?? "email",
    message: [`Hi ${first},`, ``, ...body.flatMap((p) => [p, ``]), renewal, ``, `— Community Manager`].join("\n"),
  };
}
