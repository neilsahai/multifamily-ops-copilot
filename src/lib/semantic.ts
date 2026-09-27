/**
 * Semantic layer (conceptual sample).
 *
 * One place that names each metric, its formula, window and denominator, and
 * the entities it joins. The analytics functions implement these definitions
 * and the UI renders them verbatim in tooltips and "How this was calculated",
 * so the words on screen and the code cannot drift apart.
 */

export const WINDOWS = {
  renewalDecisionDays: 90,
  upcomingExpirationDays: 60,
  flagLeaseEndDays: 90,
  maintenanceLookbackDays: 180,
  feedbackLookbackDays: 180,
} as const;

export const FLAG_RULE = {
  leaseEndWithinDays: WINDOWS.flagLeaseEndDays,
  minWorkOrders: 2,
  openOlderThanDays: 7,
  lowRatingMax: 2,
  maintenanceLookbackDays: WINDOWS.maintenanceLookbackDays,
  feedbackLookbackDays: WINDOWS.feedbackLookbackDays,
} as const;

/** Property "needs review" thresholds (compared against all other properties pooled). */
export const REVIEW_RULE = {
  renewalGapPoints: 15,
  minRenewalDecisions: 5,
  openAgeMultiple: 2,
  openAgeMinDays: 10,
} as const;

/**
 * Minimum evidence before the narrative may state a comparison. Each sentence
 * in the investigation narrative is gated on the claim that supports it.
 */
export const EVIDENCE_RULE = {
  minRenewalDecisions: REVIEW_RULE.minRenewalDecisions,
  minHvacWorkOrders: 5,
  hvacAgeMultiple: 2,
  minMaintenanceSplitGroup: 3,
} as const;

/** Transparent priority points used only to order flagged residents. */
export const PRIORITY_POINTS = {
  repeatUnresolvedMaintenance: 2,
  lowFeedback: 1,
  outreachUnanswered: 1,
  leaseEndsWithin30Days: 1,
  openWorkOrderOver21Days: 1,
} as const;

export type MetricId =
  | "occupancy"
  | "renewalRate"
  | "openWorkOrders"
  | "medianOpenWorkOrderAge"
  | "upcomingExpirations"
  | "medianHvacAge"
  | "renewalByMaintenance"
  | "flaggedResidents";

export interface MetricDefinition {
  id: MetricId;
  label: string;
  unit: "percent" | "count" | "days";
  formula: string;
  window: string;
  entities: string[];
  notes?: string;
}

const W = WINDOWS;

export const METRICS: Record<MetricId, MetricDefinition> = {
  occupancy: {
    id: "occupancy",
    label: "Occupancy",
    unit: "percent",
    formula: "occupied units ÷ total units",
    window: "As of the dataset date",
    entities: ["Property"],
  },
  renewalRate: {
    id: "renewalRate",
    label: "Renewal rate",
    unit: "percent",
    formula: "renewed ÷ (renewed + declined)",
    window: `Leases with a renewal decision in the trailing ${W.renewalDecisionDays} days (inclusive)`,
    entities: ["Lease", "Resident", "Property"],
    notes: "Pending leases are excluded from the denominator. Zero decisions shows N/A, not 0%.",
  },
  openWorkOrders: {
    id: "openWorkOrders",
    label: "Open work orders",
    unit: "count",
    formula: "count of work orders created on or before the dataset date and not resolved by it",
    window: "As of the dataset date",
    entities: ["WorkOrder", "Resident", "Property"],
  },
  medianOpenWorkOrderAge: {
    id: "medianOpenWorkOrderAge",
    label: "Median open work-order age",
    unit: "days",
    formula: "median of (dataset date − created date) across work orders open on the dataset date",
    window: "Open work orders only, as of the dataset date",
    entities: ["WorkOrder"],
    notes: "Resolved work orders are excluded. No open work orders shows N/A.",
  },
  upcomingExpirations: {
    id: "upcomingExpirations",
    label: "Upcoming expirations",
    unit: "count",
    formula: "pending leases with end date in [dataset date, dataset date + 60 days]",
    window: `Next ${W.upcomingExpirationDays} days, inclusive`,
    entities: ["Lease"],
  },
  medianHvacAge: {
    id: "medianHvacAge",
    label: "Median HVAC work-order age",
    unit: "days",
    formula: "median of (resolved date, or dataset date if open) − created date",
    window: `HVAC work orders created in the trailing ${W.maintenanceLookbackDays} days; open and resolved`,
    entities: ["WorkOrder"],
  },
  renewalByMaintenance: {
    id: "renewalByMaintenance",
    label: "Renewal rate by maintenance history",
    unit: "percent",
    formula:
      "renewal rate for residents with ≥2 work orders created in the 180 days before their decision, vs. residents with fewer",
    window: `Decisions in the trailing ${W.renewalDecisionDays} days`,
    entities: ["Lease", "WorkOrder", "Resident"],
    notes: "Small groups. Describes an association, not a cause.",
  },
  flaggedResidents: {
    id: "flaggedResidents",
    label: "Residents flagged for follow-up",
    unit: "count",
    formula: `pending lease ending within ${FLAG_RULE.leaseEndWithinDays} days AND (repeat unresolved maintenance OR feedback rating ≤ ${FLAG_RULE.lowRatingMax})`,
    window: `Maintenance and feedback in the trailing ${FLAG_RULE.maintenanceLookbackDays} days`,
    entities: ["Lease", "WorkOrder", "Feedback", "Resident"],
  },
};

export const FLAG_RULE_TEXT = [
  `Renewal is pending and the lease ends within ${FLAG_RULE.leaseEndWithinDays} days, and at least one of:`,
  `A. Repeat unresolved maintenance — ${FLAG_RULE.minWorkOrders}+ work orders created in the past ${FLAG_RULE.maintenanceLookbackDays} days, with at least one still open for more than ${FLAG_RULE.openOlderThanDays} days.`,
  `B. Low feedback — a rating of ${FLAG_RULE.lowRatingMax} or lower (out of 5) in the past ${FLAG_RULE.feedbackLookbackDays} days.`,
];
