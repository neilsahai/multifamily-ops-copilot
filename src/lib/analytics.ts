/**
 * Pure investigation functions over the dataset. No I/O, no clock reads:
 * every relative figure is measured against the `asOfDate` argument.
 *
 * As-of contract: records are read as they stood on `asOfDate`.
 *   - Records created after `asOfDate` are ignored.
 *   - A work order resolved after `asOfDate` counts as open on it.
 *   - A renewal decided after `asOfDate` counts as pending on it.
 *   - Outreach response status is taken as recorded (the fixtures store no
 *     response dates), so outreach is only filtered by when it was sent.
 */
import type {
  Dataset,
  Feedback,
  Interaction,
  ISODate,
  Lease,
  Property,
  RenewalStatus,
  Resident,
  WorkOrder,
} from "@/data/types";
import { addDays, daysBetween, isWithin } from "./dates";
import {
  EVIDENCE_RULE,
  FLAG_RULE,
  PRIORITY_POINTS,
  REVIEW_RULE,
  WINDOWS,
  type MetricId,
} from "./semantic";

// ---------- primitives ----------

export interface Ratio {
  numerator: number;
  denominator: number;
  /** null when the denominator is zero — render as "N/A", never 0%. */
  value: number | null;
}

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const onOrBefore = (date: ISODate, asOfDate: ISODate) => daysBetween(date, asOfDate) >= 0;

/** Open on `asOfDate`: created by then and not yet resolved by then. */
export function isOpenAsOf(wo: WorkOrder, asOfDate: ISODate): boolean {
  if (!onOrBefore(wo.createdAt, asOfDate)) return false;
  return !wo.resolvedAt || !onOrBefore(wo.resolvedAt, asOfDate);
}

/** Days from creation to resolution, or to `asOfDate` while still open on it. */
export function workOrderAgeDays(wo: WorkOrder, asOfDate: ISODate): number {
  const end = wo.resolvedAt && onOrBefore(wo.resolvedAt, asOfDate) ? wo.resolvedAt : asOfDate;
  return daysBetween(wo.createdAt, end);
}

/** A decision recorded after `asOfDate` had not happened yet on that date. */
export function renewalStatusAsOf(lease: Lease, asOfDate: ISODate): RenewalStatus {
  if (lease.renewalStatus === "pending") return "pending";
  if (lease.renewalDecisionDate && !onOrBefore(lease.renewalDecisionDate, asOfDate)) return "pending";
  return lease.renewalStatus;
}

// ---------- indexes ----------

function residentsOf(data: Dataset, propertyId: string): Resident[] {
  return data.residents.filter((r) => r.propertyId === propertyId);
}

function idSet(residents: Resident[]): Set<string> {
  return new Set(residents.map((r) => r.id));
}

function leaseFor(data: Dataset, residentId: string): Lease | undefined {
  return data.leases.find((l) => l.residentId === residentId);
}

function requireProperty(data: Dataset, propertyId: string): Property {
  const p = data.properties.find((x) => x.id === propertyId);
  if (!p) throw new Error(`Unknown property: ${propertyId}`);
  return p;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function formatPct(v: number | null): string {
  return v === null ? "N/A" : `${Math.round(v * 100)}%`;
}

// ---------- metric building blocks (work over any resident set) ----------

export interface RenewalRate extends Ratio {
  renewed: number;
  declined: number;
  windowStart: ISODate;
  windowEnd: ISODate;
  leaseIds: string[];
}

export function renewalRateFor(
  leases: Lease[],
  asOfDate: ISODate,
  windowDays: number = WINDOWS.renewalDecisionDays,
): RenewalRate {
  const windowStart = addDays(asOfDate, -windowDays);
  const decided = leases.filter(
    (l) =>
      l.renewalStatus !== "pending" &&
      l.renewalDecisionDate !== undefined &&
      isWithin(l.renewalDecisionDate, windowStart, asOfDate),
  );
  const renewed = decided.filter((l) => l.renewalStatus === "renewed").length;
  const declined = decided.length - renewed;
  return {
    ...ratio(renewed, renewed + declined),
    renewed,
    declined,
    windowStart,
    windowEnd: asOfDate,
    leaseIds: decided.map((l) => l.id),
  };
}

export function upcomingExpirationsFor(
  leases: Lease[],
  asOfDate: ISODate,
  windowDays: number = WINDOWS.upcomingExpirationDays,
): Lease[] {
  const end = addDays(asOfDate, windowDays);
  return leases.filter((l) => renewalStatusAsOf(l, asOfDate) === "pending" && isWithin(l.endDate, asOfDate, end));
}

// ---------- property & portfolio metrics ----------

export interface PropertyMetrics {
  property: Property;
  occupancy: Ratio;
  renewal: RenewalRate;
  openWorkOrders: { count: number; ids: string[] };
  medianOpenWorkOrderAgeDays: number | null;
  upcomingExpirations: { count: number; leaseIds: string[] };
}

export function getPropertyMetrics(
  propertyId: string,
  data: Dataset,
  asOfDate: ISODate,
): PropertyMetrics {
  const property = requireProperty(data, propertyId);
  const ids = idSet(residentsOf(data, propertyId));
  const leases = data.leases.filter((l) => ids.has(l.residentId));
  const open = data.workOrders.filter((w) => ids.has(w.residentId) && isOpenAsOf(w, asOfDate));
  const upcoming = upcomingExpirationsFor(leases, asOfDate);
  return {
    property,
    occupancy: ratio(property.occupiedUnits, property.unitCount),
    renewal: renewalRateFor(leases, asOfDate),
    openWorkOrders: { count: open.length, ids: open.map((w) => w.id) },
    medianOpenWorkOrderAgeDays: median(open.map((w) => workOrderAgeDays(w, asOfDate))),
    upcomingExpirations: { count: upcoming.length, leaseIds: upcoming.map((l) => l.id) },
  };
}

export interface ReviewStatus {
  needsReview: boolean;
  reasons: string[];
}

export interface PortfolioMetrics {
  asOfDate: ISODate;
  properties: (PropertyMetrics & { review: ReviewStatus; flaggedResidentCount: number })[];
  totals: {
    unitCount: number;
    occupancy: Ratio;
    renewal: RenewalRate;
    openWorkOrders: number;
    upcomingExpirations: number;
    propertiesNeedingReview: number;
  };
}

/**
 * A property needs review when its renewal rate trails all other properties
 * pooled by ≥ REVIEW_RULE.renewalGapPoints, or its median open work-order
 * age is ≥ REVIEW_RULE.openAgeMultiple × theirs (and at least openAgeMinDays).
 */
export function getReviewStatus(propertyId: string, data: Dataset, asOfDate: ISODate): ReviewStatus {
  const self = getPropertyMetrics(propertyId, data, asOfDate);
  const otherIds = idSet(data.residents.filter((r) => r.propertyId !== propertyId));
  const otherRenewal = renewalRateFor(
    data.leases.filter((l) => otherIds.has(l.residentId)),
    asOfDate,
  );
  const otherOpenAge = median(
    data.workOrders
      .filter((w) => otherIds.has(w.residentId) && isOpenAsOf(w, asOfDate))
      .map((w) => workOrderAgeDays(w, asOfDate)),
  );
  const reasons: string[] = [];
  if (
    self.renewal.value !== null &&
    otherRenewal.value !== null &&
    self.renewal.denominator >= REVIEW_RULE.minRenewalDecisions &&
    otherRenewal.denominator >= REVIEW_RULE.minRenewalDecisions &&
    (otherRenewal.value - self.renewal.value) * 100 >= REVIEW_RULE.renewalGapPoints
  ) {
    reasons.push(
      `Renewal rate ${formatPct(self.renewal.value)} vs ${formatPct(otherRenewal.value)} at other properties`,
    );
  }
  const selfAge = self.medianOpenWorkOrderAgeDays;
  if (
    selfAge !== null &&
    otherOpenAge !== null &&
    selfAge >= REVIEW_RULE.openAgeMinDays &&
    selfAge >= otherOpenAge * REVIEW_RULE.openAgeMultiple
  ) {
    reasons.push(`Open work orders median ${selfAge} days vs ${otherOpenAge} days elsewhere`);
  }
  return { needsReview: reasons.length > 0, reasons };
}

export function getPortfolioMetrics(data: Dataset, asOfDate: ISODate): PortfolioMetrics {
  const properties = data.properties.map((p) => ({
    ...getPropertyMetrics(p.id, data, asOfDate),
    review: getReviewStatus(p.id, data, asOfDate),
    flaggedResidentCount: getFlaggedResidents(p.id, data, asOfDate).length,
  }));
  const unitCount = sum(data.properties.map((p) => p.unitCount));
  const occupied = sum(data.properties.map((p) => p.occupiedUnits));
  return {
    asOfDate,
    properties,
    totals: {
      unitCount,
      occupancy: ratio(occupied, unitCount),
      renewal: renewalRateFor(data.leases, asOfDate),
      openWorkOrders: sum(properties.map((p) => p.openWorkOrders.count)),
      upcomingExpirations: sum(properties.map((p) => p.upcomingExpirations.count)),
      propertiesNeedingReview: properties.filter((p) => p.review.needsReview).length,
    },
  };
}

// ---------- resident flags ----------

export type FlagTrigger = "repeat_unresolved_maintenance" | "low_feedback";

export interface OutreachStatus {
  state: "no_response" | "responded" | "not_contacted";
  attempts: number;
  lastContactAt?: ISODate;
  label: string;
}

export interface PriorityFactor {
  label: string;
  points: number;
}

export interface ResidentFlagEvaluation {
  resident: Resident;
  lease: Lease;
  daysToLeaseEnd: number;
  inRenewalWindow: boolean;
  recentWorkOrders: WorkOrder[];
  openWorkOrders: { workOrder: WorkOrder; ageDays: number }[];
  oldestOpenWorkOrder: { workOrder: WorkOrder; ageDays: number } | null;
  lowFeedback: Feedback[];
  outreach: OutreachStatus;
  triggers: FlagTrigger[];
  /** Human-readable evidence for each trigger that fired. */
  reasons: string[];
  flagged: boolean;
  priorityFactors: PriorityFactor[];
  priorityScore: number;
  priorityLabel: "High" | "Medium" | "Low";
}

export function getOutreachStatus(interactions: Interaction[], asOfDate?: ISODate): OutreachStatus {
  const renewal = interactions
    .filter((i) => i.type === "renewal_offer" || i.type === "renewal_follow_up")
    .filter((i) => !asOfDate || onOrBefore(i.createdAt, asOfDate))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (renewal.length === 0) return { state: "not_contacted", attempts: 0, label: "Not yet contacted" };
  const last = renewal[renewal.length - 1];
  if (renewal.some((i) => i.status === "responded")) {
    return { state: "responded", attempts: renewal.length, lastContactAt: last.createdAt, label: "Responded" };
  }
  return {
    state: "no_response",
    attempts: renewal.length,
    lastContactAt: last.createdAt,
    label: `No response (${renewal.length} ${renewal.length === 1 ? "attempt" : "attempts"})`,
  };
}

/**
 * Flag rule (see FLAG_RULE_TEXT in semantic.ts):
 *   pending lease ending in [asOf, asOf + 90d]
 *   AND ( A: ≥2 work orders created in [asOf − 180d, asOf] with ≥1 still open > 7 days
 *      OR B: any feedback rating ≤ 2 created in [asOf − 180d, asOf] )
 */
export function evaluateResidentFlag(
  residentId: string,
  data: Dataset,
  asOfDate: ISODate,
): ResidentFlagEvaluation | null {
  const resident = data.residents.find((r) => r.id === residentId);
  const lease = leaseFor(data, residentId);
  if (!resident || !lease) return null;

  const daysToLeaseEnd = daysBetween(asOfDate, lease.endDate);
  const inRenewalWindow =
    renewalStatusAsOf(lease, asOfDate) === "pending" &&
    daysToLeaseEnd >= 0 &&
    daysToLeaseEnd <= FLAG_RULE.leaseEndWithinDays;

  const woStart = addDays(asOfDate, -FLAG_RULE.maintenanceLookbackDays);
  const recentWorkOrders = data.workOrders
    .filter((w) => w.residentId === residentId && isWithin(w.createdAt, woStart, asOfDate))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const openWorkOrders = recentWorkOrders
    .filter((w) => isOpenAsOf(w, asOfDate))
    .map((workOrder) => ({ workOrder, ageDays: workOrderAgeDays(workOrder, asOfDate) }))
    .sort((a, b) => b.ageDays - a.ageDays);
  const oldestOpenWorkOrder = openWorkOrders[0] ?? null;

  const fbStart = addDays(asOfDate, -FLAG_RULE.feedbackLookbackDays);
  const lowFeedback = data.feedback.filter(
    (f) =>
      f.residentId === residentId &&
      f.rating <= FLAG_RULE.lowRatingMax &&
      isWithin(f.createdAt, fbStart, asOfDate),
  );

  const outreach = getOutreachStatus(
    data.interactions.filter((i) => i.residentId === residentId),
    asOfDate,
  );

  const triggers: FlagTrigger[] = [];
  const reasons: string[] = [];
  const agedOpen = openWorkOrders.filter((o) => o.ageDays > FLAG_RULE.openOlderThanDays);
  if (recentWorkOrders.length >= FLAG_RULE.minWorkOrders && agedOpen.length > 0) {
    triggers.push("repeat_unresolved_maintenance");
    reasons.push(
      `${recentWorkOrders.length} work orders in ${FLAG_RULE.maintenanceLookbackDays} days; ${agedOpen[0].workOrder.id} open ${agedOpen[0].ageDays} days`,
    );
  }
  if (lowFeedback.length > 0) {
    triggers.push("low_feedback");
    const worst = [...lowFeedback].sort((a, b) => a.rating - b.rating)[0];
    reasons.push(`Feedback rated ${worst.rating}/5 (${worst.id})`);
  }
  const flagged = inRenewalWindow && triggers.length > 0;

  const priorityFactors: PriorityFactor[] = [];
  if (flagged) {
    if (triggers.includes("repeat_unresolved_maintenance"))
      priorityFactors.push({ label: "Repeat unresolved maintenance", points: PRIORITY_POINTS.repeatUnresolvedMaintenance });
    if (triggers.includes("low_feedback"))
      priorityFactors.push({ label: "Low feedback rating", points: PRIORITY_POINTS.lowFeedback });
    if (outreach.state === "no_response")
      priorityFactors.push({ label: "Renewal outreach unanswered", points: PRIORITY_POINTS.outreachUnanswered });
    if (daysToLeaseEnd <= 30)
      priorityFactors.push({ label: "Lease ends within 30 days", points: PRIORITY_POINTS.leaseEndsWithin30Days });
    if (oldestOpenWorkOrder && oldestOpenWorkOrder.ageDays > 21)
      priorityFactors.push({ label: "Work order open over 21 days", points: PRIORITY_POINTS.openWorkOrderOver21Days });
  }
  const priorityScore = sum(priorityFactors.map((f) => f.points));

  return {
    resident,
    lease,
    daysToLeaseEnd,
    inRenewalWindow,
    recentWorkOrders,
    openWorkOrders,
    oldestOpenWorkOrder,
    lowFeedback,
    outreach,
    triggers,
    reasons,
    flagged,
    priorityFactors,
    priorityScore,
    priorityLabel: priorityScore >= 4 ? "High" : priorityScore >= 2 ? "Medium" : "Low",
  };
}

/** Flagged residents, highest priority first, then soonest lease end. */
export function getFlaggedResidents(
  propertyId: string,
  data: Dataset,
  asOfDate: ISODate,
): ResidentFlagEvaluation[] {
  return residentsOf(data, propertyId)
    .map((r) => evaluateResidentFlag(r.id, data, asOfDate))
    .filter((e): e is ResidentFlagEvaluation => e !== null && e.flagged)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.daysToLeaseEnd - b.daysToLeaseEnd);
}

// ---------- resident timeline ----------

export type TimelineKind =
  | "lease_start"
  | "lease_end"
  | "renewal_decision"
  | "work_order_created"
  | "work_order_resolved"
  | "feedback"
  | "interaction";

export interface TimelineEvent {
  date: ISODate;
  kind: TimelineKind;
  title: string;
  detail?: string;
  sourceId: string;
}

export function getResidentTimeline(residentId: string, data: Dataset): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const lease = leaseFor(data, residentId);
  if (lease) {
    events.push({ date: lease.startDate, kind: "lease_start", title: "Lease started", sourceId: lease.id });
    events.push({
      date: lease.endDate,
      kind: "lease_end",
      title: "Lease end date",
      detail: `Renewal status: ${lease.renewalStatus}`,
      sourceId: lease.id,
    });
    if (lease.renewalDecisionDate) {
      events.push({
        date: lease.renewalDecisionDate,
        kind: "renewal_decision",
        title: `Renewal ${lease.renewalStatus}`,
        sourceId: lease.id,
      });
    }
  }
  for (const w of data.workOrders.filter((x) => x.residentId === residentId)) {
    events.push({
      date: w.createdAt,
      kind: "work_order_created",
      title: `${w.category} work order opened`,
      detail: `${w.summary} · ${w.priority} priority`,
      sourceId: w.id,
    });
    if (w.resolvedAt) {
      events.push({
        date: w.resolvedAt,
        kind: "work_order_resolved",
        title: `${w.category} work order resolved`,
        detail: `${daysBetween(w.createdAt, w.resolvedAt)} days after it was opened`,
        sourceId: w.id,
      });
    }
  }
  for (const f of data.feedback.filter((x) => x.residentId === residentId)) {
    events.push({ date: f.createdAt, kind: "feedback", title: `Feedback rated ${f.rating}/5`, detail: f.text, sourceId: f.id });
  }
  const IX_TITLES: Record<Interaction["type"], string> = {
    renewal_offer: "Renewal offer sent",
    renewal_follow_up: "Renewal follow-up sent",
    maintenance_update: "Maintenance notice sent",
  };
  for (const i of data.interactions.filter((x) => x.residentId === residentId)) {
    const status = i.status === "no_response" ? " · no response" : i.status === "responded" ? " · responded" : "";
    events.push({ date: i.createdAt, kind: "interaction", title: IX_TITLES[i.type] + status, detail: i.summary, sourceId: i.id });
  }
  const order: Record<TimelineKind, number> = {
    lease_start: 0,
    work_order_created: 1,
    work_order_resolved: 2,
    feedback: 3,
    interaction: 4,
    renewal_decision: 5,
    lease_end: 6,
  };
  return events.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
}

// ---------- evidence packet ----------

export interface MetricValue {
  value: number | null;
  numerator?: number;
  denominator?: number;
  /** e.g. "3 of 8 decisions" or "21 work orders" */
  basis: string;
}

export interface ClaimWindow {
  label: string;
  start: ISODate;
  end: ISODate;
}

/** A labeled set of record IDs a claim was calculated from. */
export interface SourceGroup {
  label: string;
  ids: string[];
}

export interface EvidenceClaim {
  id: string;
  metricId: MetricId;
  title: string;
  statement: string;
  unit: "percent" | "days" | "count";
  subjectLabel: string;
  subject: MetricValue;
  comparisonLabel?: string;
  comparison?: MetricValue;
  windows: ClaimWindow[];
  sources: SourceGroup[];
  caveat?: string;
}

export interface EvidencePacket {
  propertyId: string;
  propertyName: string;
  asOfDate: ISODate;
  generatedBy: "deterministic-template";
  patternDetected: boolean;
  /** Which comparisons met their evidence thresholds; each narrative sentence is gated on one. */
  support: {
    renewalLags: boolean;
    hvacSlower: boolean;
    maintenanceSplitSufficient: boolean;
    repeatMaintenanceRenewsLower: boolean;
  };
  headline: string;
  narrative: string[];
  claims: EvidenceClaim[];
  flaggedResidentIds: string[];
  caveats: string[];
}

export function allSourceIds(claim: EvidenceClaim): string[] {
  return [...new Set(claim.sources.flatMap((g) => g.ids))];
}

/**
 * Renewal rate split by whether a resident had ≥2 work orders in the 180 days
 * before deciding. Work-order provenance is kept for both groups; only work
 * orders created in [decision − 180d, decision] are counted or cited.
 */
export function renewalByMaintenanceHistory(propertyId: string, data: Dataset, asOfDate: ISODate) {
  const ids = idSet(residentsOf(data, propertyId));
  const decided = renewalRateFor(data.leases.filter((l) => ids.has(l.residentId)), asOfDate);
  const decidedLeases = data.leases.filter((l) => decided.leaseIds.includes(l.id));
  const repeat: Lease[] = [];
  const other: Lease[] = [];
  const repeatWorkOrderIds: string[] = [];
  const otherWorkOrderIds: string[] = [];
  for (const l of decidedLeases) {
    const start = addDays(l.renewalDecisionDate!, -WINDOWS.maintenanceLookbackDays);
    const wos = data.workOrders.filter(
      (w) => w.residentId === l.residentId && isWithin(w.createdAt, start, l.renewalDecisionDate!),
    );
    if (wos.length >= 2) {
      repeat.push(l);
      repeatWorkOrderIds.push(...wos.map((w) => w.id));
    } else {
      other.push(l);
      otherWorkOrderIds.push(...wos.map((w) => w.id));
    }
  }
  const rate = (ls: Lease[]) => ratio(ls.filter((l) => l.renewalStatus === "renewed").length, ls.length);
  return {
    repeat: rate(repeat),
    other: rate(other),
    repeatLeaseIds: repeat.map((l) => l.id),
    otherLeaseIds: other.map((l) => l.id),
    repeatWorkOrderIds,
    otherWorkOrderIds,
    workOrderIds: [...repeatWorkOrderIds, ...otherWorkOrderIds],
  };
}

export function medianHvacAge(workOrders: WorkOrder[], asOfDate: ISODate) {
  const start = addDays(asOfDate, -WINDOWS.maintenanceLookbackDays);
  const hvac = workOrders.filter((w) => w.category === "HVAC" && isWithin(w.createdAt, start, asOfDate));
  return { median: median(hvac.map((w) => workOrderAgeDays(w, asOfDate))), ids: hvac.map((w) => w.id), start };
}

export function buildEvidencePacket(propertyId: string, data: Dataset, asOfDate: ISODate): EvidencePacket {
  const property = requireProperty(data, propertyId);
  const place = property.neighborhood;
  const selfIds = idSet(residentsOf(data, propertyId));
  const otherIds = idSet(data.residents.filter((r) => r.propertyId !== propertyId));
  const selfLeases = data.leases.filter((l) => selfIds.has(l.residentId));
  const otherLeases = data.leases.filter((l) => otherIds.has(l.residentId));
  const renewalStart = addDays(asOfDate, -WINDOWS.renewalDecisionDays);
  const lookbackStart = addDays(asOfDate, -WINDOWS.maintenanceLookbackDays);
  const otherCount = data.properties.length - 1;
  const otherLabel = `Other ${otherCount} ${otherCount === 1 ? "property" : "properties"}`;
  const days = (v: number | null) => (v === null ? "N/A" : `${v} days`);

  // 1. Renewal rate vs. other properties.
  const selfRenewal = renewalRateFor(selfLeases, asOfDate);
  const otherRenewal = renewalRateFor(otherLeases, asOfDate);
  // Unrounded for thresholds; rounded only for display.
  const renewalGapPts =
    selfRenewal.value !== null && otherRenewal.value !== null
      ? (otherRenewal.value - selfRenewal.value) * 100
      : null;
  const renewalLags =
    renewalGapPts !== null &&
    selfRenewal.denominator >= EVIDENCE_RULE.minRenewalDecisions &&
    otherRenewal.denominator >= EVIDENCE_RULE.minRenewalDecisions &&
    renewalGapPts >= REVIEW_RULE.renewalGapPoints;

  // 2. HVAC work-order age vs. other properties.
  const selfHvac = medianHvacAge(data.workOrders.filter((w) => selfIds.has(w.residentId)), asOfDate);
  const otherHvac = medianHvacAge(data.workOrders.filter((w) => otherIds.has(w.residentId)), asOfDate);
  const hvacSlower =
    selfHvac.median !== null &&
    otherHvac.median !== null &&
    selfHvac.ids.length >= EVIDENCE_RULE.minHvacWorkOrders &&
    otherHvac.ids.length >= EVIDENCE_RULE.minHvacWorkOrders &&
    selfHvac.median >= otherHvac.median * EVIDENCE_RULE.hvacAgeMultiple;

  // 3. Renewal rate by maintenance history, within this property.
  const split = renewalByMaintenanceHistory(propertyId, data, asOfDate);
  const splitSufficient =
    split.repeat.denominator >= EVIDENCE_RULE.minMaintenanceSplitGroup &&
    split.other.denominator >= EVIDENCE_RULE.minMaintenanceSplitGroup;
  const repeatLower = splitSufficient && split.repeat.value! < split.other.value!;

  // 4. Flagged cohort.
  const flagged = getFlaggedResidents(propertyId, data, asOfDate);
  const pendingInWindow = selfLeases.filter((l) => {
    const d = daysBetween(asOfDate, l.endDate);
    return renewalStatusAsOf(l, asOfDate) === "pending" && d >= 0 && d <= FLAG_RULE.leaseEndWithinDays;
  });
  const viaRuleA = flagged.filter((f) => f.triggers.includes("repeat_unresolved_maintenance"));
  const viaRuleBOnly = flagged.filter((f) => f.triggers.length === 1 && f.triggers[0] === "low_feedback");
  const withOpen = flagged.filter((f) => f.openWorkOrders.length > 0);
  const feedbackWithoutOpen = flagged.filter((f) => f.openWorkOrders.length === 0);

  const claims: EvidenceClaim[] = [
    {
      id: "renewal-rate-vs-portfolio",
      metricId: "renewalRate",
      title: "Renewal rate, trailing 90 days",
      statement:
        renewalGapPts === null
          ? "Not enough renewal decisions to compare."
          : renewalGapPts > 0
            ? `${place} renewed ${formatPct(selfRenewal.value)} of decided leases vs ${formatPct(otherRenewal.value)} across the other properties — ${Math.round(renewalGapPts)} points lower.`
            : `${place} renewed ${formatPct(selfRenewal.value)} of decided leases vs ${formatPct(otherRenewal.value)} across the other properties.`,
      unit: "percent",
      subjectLabel: place,
      subject: { value: selfRenewal.value, numerator: selfRenewal.renewed, denominator: selfRenewal.denominator, basis: `${selfRenewal.renewed} of ${selfRenewal.denominator} decisions` },
      comparisonLabel: otherLabel,
      comparison: { value: otherRenewal.value, numerator: otherRenewal.renewed, denominator: otherRenewal.denominator, basis: `${otherRenewal.renewed} of ${otherRenewal.denominator} decisions` },
      windows: [{ label: "Renewal decisions", start: renewalStart, end: asOfDate }],
      sources: [
        { label: `${place} decided leases`, ids: selfRenewal.leaseIds },
        { label: `${otherLabel} decided leases`, ids: otherRenewal.leaseIds },
      ],
    },
    {
      id: "hvac-age-vs-portfolio",
      metricId: "medianHvacAge",
      title: "Median HVAC work-order age",
      statement: `HVAC work orders at ${place} took a median of ${days(selfHvac.median)} to resolve (or are still open) vs ${days(otherHvac.median)} elsewhere.`,
      unit: "days",
      subjectLabel: place,
      subject: { value: selfHvac.median, denominator: selfHvac.ids.length, basis: `${selfHvac.ids.length} HVAC work orders` },
      comparisonLabel: otherLabel,
      comparison: { value: otherHvac.median, denominator: otherHvac.ids.length, basis: `${otherHvac.ids.length} HVAC work orders` },
      windows: [{ label: "Work orders created", start: selfHvac.start, end: asOfDate }],
      sources: [
        { label: `${place} HVAC work orders`, ids: selfHvac.ids },
        { label: `${otherLabel} HVAC work orders`, ids: otherHvac.ids },
      ],
    },
    {
      id: "renewal-by-maintenance-history",
      metricId: "renewalByMaintenance",
      title: "Renewals by maintenance history",
      statement: `Among ${place} residents who decided in the window, those with 2+ work orders in the prior 180 days renewed at ${formatPct(split.repeat.value)} vs ${formatPct(split.other.value)} for everyone else.`,
      unit: "percent",
      subjectLabel: "2+ work orders",
      subject: { value: split.repeat.value, numerator: split.repeat.numerator, denominator: split.repeat.denominator, basis: `${split.repeat.numerator} of ${split.repeat.denominator} renewed` },
      comparisonLabel: "Fewer than 2",
      comparison: { value: split.other.value, numerator: split.other.numerator, denominator: split.other.denominator, basis: `${split.other.numerator} of ${split.other.denominator} renewed` },
      windows: [
        { label: "Renewal decisions", start: renewalStart, end: asOfDate },
        { label: "Maintenance lookback", start: addDays(renewalStart, -WINDOWS.maintenanceLookbackDays), end: asOfDate },
      ],
      sources: [
        { label: "Leases, 2+ work orders", ids: split.repeatLeaseIds },
        { label: "Leases, fewer than 2", ids: split.otherLeaseIds },
        { label: "Work orders, 2+ group", ids: split.repeatWorkOrderIds },
        { label: "Work orders, fewer-than-2 group", ids: split.otherWorkOrderIds },
      ],
      caveat: splitSufficient
        ? `Small groups (n = ${split.repeat.denominator} and ${split.other.denominator}). An association worth checking, not proof of cause — other factors such as pricing also affect renewals.`
        : `Too few decisions in at least one group (n = ${split.repeat.denominator} and ${split.other.denominator}; minimum ${EVIDENCE_RULE.minMaintenanceSplitGroup}) to compare.`,
    },
    {
      id: "flagged-cohort",
      metricId: "flaggedResidents",
      title: "Residents flagged for follow-up",
      statement: `${flagged.length} of ${pendingInWindow.length} pending leases ending within ${FLAG_RULE.leaseEndWithinDays} days meet the flag rule: ${viaRuleA.length} via rule A (multiple work orders, one open more than ${FLAG_RULE.openOlderThanDays} days) and ${viaRuleBOnly.length} via low feedback only.`,
      unit: "count",
      subjectLabel: "Flagged",
      subject: { value: flagged.length, denominator: pendingInWindow.length, basis: `of ${pendingInWindow.length} pending leases ending within ${FLAG_RULE.leaseEndWithinDays} days` },
      windows: [
        { label: "Lease end", start: asOfDate, end: addDays(asOfDate, FLAG_RULE.leaseEndWithinDays) },
        { label: "Maintenance and feedback lookback", start: lookbackStart, end: asOfDate },
      ],
      sources: [
        { label: "Flagged leases", ids: flagged.map((f) => f.lease.id) },
        { label: "Denominator: pending leases ending ≤90 days", ids: pendingInWindow.map((l) => l.id) },
        { label: "Rule A work orders", ids: viaRuleA.flatMap((f) => f.recentWorkOrders.map((w) => w.id)) },
        { label: "Rule B feedback", ids: flagged.flatMap((f) => f.lowFeedback.map((x) => x.id)) },
      ],
    },
  ];

  const patternDetected = renewalLags && repeatLower && flagged.length > 0;

  const headline = patternDetected
    ? "Renewals among residents with repeated maintenance issues warrant review."
    : renewalLags && hvacSlower
      ? `Renewals and HVAC response times at ${place} both trail the rest of the portfolio; these records do not tie the renewal gap to individual residents' maintenance history.`
      : renewalLags
        ? `Renewals at ${place} trail the rest of the portfolio; the cause is not clear from these records.`
        : flagged.length > 0
          ? `No property-wide renewal/service pattern met the review threshold; ${flagged.length} resident${flagged.length === 1 ? "" : "s"} still meet the individual flag rule.`
          : "No renewal/service pattern met the review threshold at this property.";

  const narrative: string[] = [];
  if (renewalLags) {
    narrative.push(
      `Renewal performance at ${property.name} is ${Math.round(renewalGapPts!)} points below the rest of the portfolio over the trailing 90 days (${selfRenewal.renewed} of ${selfRenewal.denominator} vs ${otherRenewal.renewed} of ${otherRenewal.denominator}).`,
    );
  }
  if (hvacSlower) {
    narrative.push(
      `HVAC work orders here have a median age of ${selfHvac.median} days versus ${otherHvac.median} elsewhere (${selfHvac.ids.length} and ${otherHvac.ids.length} work orders).`,
    );
  }
  if (renewalLags || hvacSlower) {
    if (repeatLower) {
      narrative.push(
        `Within ${place}, residents with 2+ work orders in the 180 days before deciding renewed ${formatPct(split.repeat.value)} of the time (${split.repeat.numerator} of ${split.repeat.denominator}) vs ${formatPct(split.other.value)} (${split.other.numerator} of ${split.other.denominator}) for other residents. This is an association in small groups: service problems may be contributing, but pricing and other factors have not been ruled out.`,
      );
    } else if (splitSufficient) {
      narrative.push(
        `Residents with 2+ recent work orders did not renew at a lower rate (${formatPct(split.repeat.value)}, ${split.repeat.numerator} of ${split.repeat.denominator}, vs ${formatPct(split.other.value)}, ${split.other.numerator} of ${split.other.denominator}), so these records do not link the renewal gap to maintenance history.`,
      );
    } else {
      narrative.push(
        `Too few renewal decisions to compare residents by maintenance history (n = ${split.repeat.denominator} and ${split.other.denominator}).`,
      );
    }
  } else {
    narrative.push(
      `Renewal rate: ${formatPct(selfRenewal.value)} (${selfRenewal.renewed} of ${selfRenewal.denominator}) vs ${formatPct(otherRenewal.value)} at other properties. Median HVAC work-order age: ${days(selfHvac.median)} vs ${days(otherHvac.median)}.`,
    );
  }
  if (flagged.length > 0) {
    const steps = [
      withOpen.length > 0 && "resolve the open work orders",
      feedbackWithoutOpen.length > 0 && "review the feedback concerns",
    ].filter(Boolean);
    narrative.push(
      `${flagged.length} resident${flagged.length === 1 ? "" : "s"} with renewals in the next ${FLAG_RULE.leaseEndWithinDays} days meet the flag rule: ${withOpen.length} ${withOpen.length === 1 ? "has" : "have"} an open work order and ${feedbackWithoutOpen.length} ${feedbackWithoutOpen.length === 1 ? "is" : "are"} flagged for low feedback with no open work order. Suggested next step: ${steps.join(" and ")} before renewal outreach continues.`,
    );
  }

  return {
    propertyId,
    propertyName: property.name,
    asOfDate,
    generatedBy: "deterministic-template",
    patternDetected,
    support: {
      renewalLags,
      hvacSlower,
      maintenanceSplitSufficient: splitSufficient,
      repeatMaintenanceRenewsLower: repeatLower,
    },
    headline,
    narrative,
    claims,
    flaggedResidentIds: flagged.map((f) => f.resident.id),
    caveats: [
      "Synthetic data. Figures describe associations in this dataset, not causes.",
      "Leases in the dataset are the renewal-cycle cohort, not every unit at each property.",
    ],
  };
}
