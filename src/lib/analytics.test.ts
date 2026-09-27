import { describe, expect, it } from "vitest";
import { AS_OF_DATE, dataset } from "@/data";
import type { Dataset, Feedback, Lease, WorkOrder } from "@/data/types";
import {
  allSourceIds,
  buildEvidencePacket,
  isOpenAsOf,
  evaluateResidentFlag,
  getFlaggedResidents,
  getPortfolioMetrics,
  getPropertyMetrics,
  getResidentTimeline,
  median,
  renewalByMaintenanceHistory,
  renewalRateFor,
  upcomingExpirationsFor,
  workOrderAgeDays,
} from "./analytics";

const AS_OF = "2026-09-26";

function lease(id: string, over: Partial<Lease> = {}): Lease {
  return { id, residentId: `R-${id}`, monthlyRent: 2000, startDate: "2025-10-01", endDate: "2026-09-30", renewalStatus: "pending", ...over };
}

function wo(id: string, over: Partial<WorkOrder> = {}): WorkOrder {
  return { id, residentId: "R-1", category: "HVAC", summary: "x", createdAt: "2026-09-01", status: "resolved", resolvedAt: "2026-09-05", priority: "medium", ...over };
}

/** Tiny single-resident dataset for flag-rule tests. */
function oneResident(opts: { endDate?: string; status?: Lease["renewalStatus"]; workOrders?: WorkOrder[]; feedback?: Feedback[] }): Dataset {
  return {
    asOfDate: AS_OF,
    properties: [{ id: "p1", name: "Test", neighborhood: "Test", unitCount: 10, occupiedUnits: 9 }],
    residents: [{ id: "R-1", propertyId: "p1", name: "Test Resident", unit: "101" }],
    leases: [lease("L-1", { residentId: "R-1", endDate: opts.endDate ?? "2026-10-31", renewalStatus: opts.status ?? "pending" })],
    workOrders: opts.workOrders ?? [],
    feedback: opts.feedback ?? [],
    interactions: [],
  };
}

describe("renewal rate", () => {
  it("excludes pending leases from the denominator", () => {
    const r = renewalRateFor(
      [
        lease("a", { renewalStatus: "renewed", renewalDecisionDate: "2026-09-01" }),
        lease("b", { renewalStatus: "declined", renewalDecisionDate: "2026-09-02" }),
        lease("c", { renewalStatus: "pending" }),
        lease("d", { renewalStatus: "pending" }),
      ],
      AS_OF,
    );
    expect(r).toMatchObject({ renewed: 1, declined: 1, denominator: 2, value: 0.5 });
  });

  it("returns null (N/A) for a zero denominator, not 0", () => {
    const r = renewalRateFor([lease("c")], AS_OF);
    expect(r.denominator).toBe(0);
    expect(r.value).toBeNull();
  });

  it("includes decisions exactly 90 days back and excludes day 91", () => {
    const r = renewalRateFor(
      [
        lease("in", { renewalStatus: "renewed", renewalDecisionDate: "2026-06-28" }),
        lease("out", { renewalStatus: "declined", renewalDecisionDate: "2026-06-27" }),
      ],
      AS_OF,
    );
    expect(r.leaseIds).toEqual(["in"]);
    expect(r.value).toBe(1);
  });
});

describe("work-order age", () => {
  it("ages open work orders to the as-of date, not the real clock", () => {
    expect(workOrderAgeDays(wo("o", { status: "open", resolvedAt: undefined, createdAt: "2026-09-02" }), AS_OF)).toBe(24);
  });
  it("uses the resolution date for resolved work orders", () => {
    expect(workOrderAgeDays(wo("r", { createdAt: "2026-06-14", resolvedAt: "2026-06-29" }), AS_OF)).toBe(15);
  });
  it("median handles even, odd and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("upcoming expirations", () => {
  it("counts pending leases ending on day 0 and day 60, but not day 61 or decided leases", () => {
    const ls = [
      lease("d0", { endDate: "2026-09-26" }),
      lease("d60", { endDate: "2026-11-25" }),
      lease("d61", { endDate: "2026-11-26" }),
      lease("past", { endDate: "2026-09-25" }),
      lease("renewed", { endDate: "2026-10-10", renewalStatus: "renewed", renewalDecisionDate: "2026-09-01" }),
    ];
    expect(upcomingExpirationsFor(ls, AS_OF).map((l) => l.id)).toEqual(["d0", "d60"]);
  });
});

describe("resident flag rule", () => {
  const openAged = wo("W2", { createdAt: "2026-09-10", status: "open", resolvedAt: undefined }); // 16 days
  const resolved = wo("W1", { createdAt: "2026-08-01", resolvedAt: "2026-08-10" });

  it("flags repeat unresolved maintenance (2+ work orders, one open > 7 days)", () => {
    const e = evaluateResidentFlag("R-1", oneResident({ workOrders: [resolved, openAged] }), AS_OF)!;
    expect(e.flagged).toBe(true);
    expect(e.triggers).toEqual(["repeat_unresolved_maintenance"]);
    expect(e.reasons[0]).toContain("W2 open 16 days");
  });

  it("does not flag when the open work order is exactly 7 days old", () => {
    const sevenDays = wo("W2", { createdAt: "2026-09-19", status: "open", resolvedAt: undefined });
    expect(evaluateResidentFlag("R-1", oneResident({ workOrders: [resolved, sevenDays] }), AS_OF)!.flagged).toBe(false);
  });

  it("does not flag a single open work order", () => {
    expect(evaluateResidentFlag("R-1", oneResident({ workOrders: [openAged] }), AS_OF)!.flagged).toBe(false);
  });

  it("flags feedback rated 2 or lower, but not 3", () => {
    const fb = (rating: Feedback["rating"]): Feedback => ({ id: "F1", residentId: "R-1", createdAt: "2026-09-01", rating, text: "" });
    expect(evaluateResidentFlag("R-1", oneResident({ feedback: [fb(2)] }), AS_OF)!.triggers).toEqual(["low_feedback"]);
    expect(evaluateResidentFlag("R-1", oneResident({ feedback: [fb(3)] }), AS_OF)!.flagged).toBe(false);
  });

  it("requires a pending lease ending within 90 days (inclusive)", () => {
    const signals = { workOrders: [resolved, openAged] };
    expect(evaluateResidentFlag("R-1", oneResident({ ...signals, endDate: "2026-12-25" }), AS_OF)!.flagged).toBe(true);
    expect(evaluateResidentFlag("R-1", oneResident({ ...signals, endDate: "2026-12-26" }), AS_OF)!.flagged).toBe(false);
    expect(evaluateResidentFlag("R-1", oneResident({ ...signals, status: "renewed" }), AS_OF)!.flagged).toBe(false);
  });
});

describe("as-of consistency", () => {
  it("ignores work orders created after the as-of date and treats later resolutions as open", () => {
    expect(isOpenAsOf(wo("future", { status: "open", resolvedAt: undefined, createdAt: "2026-09-27" }), AS_OF)).toBe(false);
    const laterResolved = wo("later", { createdAt: "2026-09-20", resolvedAt: "2026-09-30", status: "resolved" });
    expect(isOpenAsOf(laterResolved, AS_OF)).toBe(true);
    expect(workOrderAgeDays(laterResolved, AS_OF)).toBe(6);
  });

  it("does not let a future-created ticket change today's open count", () => {
    const WL = "p-westloop";
    const before = getPropertyMetrics(WL, dataset, AS_OF_DATE).openWorkOrders.count;
    const withFuture: Dataset = {
      ...dataset,
      workOrders: [...dataset.workOrders, wo("WO-FUTURE", { residentId: "R-WL-001", status: "open", resolvedAt: undefined, createdAt: "2026-10-05" })],
    };
    expect(getPropertyMetrics(WL, withFuture, AS_OF_DATE).openWorkOrders.count).toBe(before);
  });

  it("treats a renewal decided after the as-of date as pending", () => {
    const later = lease("x", { endDate: "2026-10-20", renewalStatus: "renewed", renewalDecisionDate: "2026-10-01" });
    expect(upcomingExpirationsFor([later], AS_OF).map((l) => l.id)).toEqual(["x"]);
    expect(renewalRateFor([later], AS_OF).denominator).toBe(0);
  });
});

describe("synthetic story (fixtures)", () => {
  const WL = "p-westloop";

  it("West Loop is the only property flagged for review", () => {
    const p = getPortfolioMetrics(dataset, AS_OF_DATE);
    expect(p.properties.filter((x) => x.review.needsReview).map((x) => x.property.id)).toEqual([WL]);
    expect(p.properties).toHaveLength(8);
  });

  it("West Loop metrics come from the fixture records", () => {
    const m = getPropertyMetrics(WL, dataset, AS_OF_DATE);
    expect(m.renewal).toMatchObject({ renewed: 3, declined: 5, denominator: 8 });
    expect(m.openWorkOrders.count).toBe(8);
    expect(m.medianOpenWorkOrderAgeDays).toBe(11.5);
    expect(m.upcomingExpirations.count).toBe(7);
  });

  it("flags six West Loop residents with Sarah Chen first", () => {
    const flagged = getFlaggedResidents(WL, dataset, AS_OF_DATE);
    expect(flagged).toHaveLength(6);
    expect(flagged[0].resident.name).toBe("Sarah Chen");
    expect(flagged[0].triggers).toEqual(["repeat_unresolved_maintenance", "low_feedback"]);
    expect(flagged[0].oldestOpenWorkOrder?.ageDays).toBe(24);
    expect(flagged[0].outreach.state).toBe("no_response");
    // Near-misses stay unflagged: open only 5 days, single work order, lease > 90 days out, rating 3.
    const ids = flagged.map((f) => f.resident.id);
    for (const nearMiss of ["R-WL-007", "R-WL-008", "R-WL-009", "R-WL-010"]) expect(ids).not.toContain(nearMiss);
  });

  it("evidence packet agrees with the metric functions", () => {
    const packet = buildEvidencePacket(WL, dataset, AS_OF_DATE);
    const metrics = getPropertyMetrics(WL, dataset, AS_OF_DATE);
    const renewal = packet.claims.find((c) => c.id === "renewal-rate-vs-portfolio")!;
    expect(renewal.subject.value).toBe(metrics.renewal.value);
    expect(renewal.subject.denominator).toBe(metrics.renewal.denominator);
    expect(packet.patternDetected).toBe(true);
    expect(packet.flaggedResidentIds).toEqual(getFlaggedResidents(WL, dataset, AS_OF_DATE).map((f) => f.resident.id));
    expect(packet.narrative.join(" ")).not.toMatch(/\bcaused?\b|\bproves?\b/i);
  });

  it("cites subject and comparison records, matching each claim's denominators", () => {
    const packet = buildEvidencePacket(WL, dataset, AS_OF_DATE);
    const claim = (id: string) => packet.claims.find((c) => c.id === id)!;
    const group = (id: string, label: string) => claim(id).sources.find((g) => g.label.startsWith(label))!.ids;

    const renewal = claim("renewal-rate-vs-portfolio");
    expect(renewal.sources[0].ids).toHaveLength(renewal.subject.denominator!);
    expect(renewal.sources[1].ids).toHaveLength(renewal.comparison!.denominator!);
    expect(renewal.sources[1].ids.every((id) => !id.startsWith("L-WL"))).toBe(true);

    const hvac = claim("hvac-age-vs-portfolio");
    expect(hvac.sources[0].ids).toHaveLength(hvac.subject.denominator!);
    expect(hvac.sources[1].ids).toHaveLength(hvac.comparison!.denominator!);

    const split = claim("renewal-by-maintenance-history");
    expect(group("renewal-by-maintenance-history", "Leases, 2+")).toHaveLength(split.subject.denominator!);
    expect(group("renewal-by-maintenance-history", "Leases, fewer")).toHaveLength(split.comparison!.denominator!);

    const cohort = claim("flagged-cohort");
    expect(group("flagged-cohort", "Flagged leases")).toHaveLength(cohort.subject.value!);
    expect(group("flagged-cohort", "Denominator")).toHaveLength(cohort.subject.denominator!);
    expect(group("flagged-cohort", "Rule A")).toContain("WO-WL-1093");
    expect(group("flagged-cohort", "Rule B")).toEqual(expect.arrayContaining(["FB-WL-301", "FB-WL-302", "FB-WL-303"]));
    // Expiry window (forward) and evidence lookback (backward) are reported separately.
    expect(cohort.windows.map((w) => w.label)).toEqual(["Lease end", "Maintenance and feedback lookback"]);
    expect(cohort.windows[0]).toMatchObject({ start: "2026-09-26", end: "2026-12-25" });
    expect(cohort.windows[1]).toMatchObject({ start: "2026-03-30", end: "2026-09-26" });

    for (const c of packet.claims) {
      for (const id of allSourceIds(c)) {
        const exists =
          dataset.leases.some((l) => l.id === id) ||
          dataset.workOrders.some((w) => w.id === id) ||
          dataset.feedback.some((f) => f.id === id);
        expect(exists, id).toBe(true);
      }
    }
  });

  it("states the cohort split: 4 with open work orders, 2 feedback-only", () => {
    const text = buildEvidencePacket(WL, dataset, AS_OF_DATE).narrative.join(" ");
    expect(text).toContain("4 have an open work order and 2 are flagged for low feedback with no open work order");
    expect(text).not.toContain("show the same signals");
  });

  it("does not assert a maintenance association the data contradicts", () => {
    // Residents with repeat maintenance now renew 4 of 5; everyone else 0 of 3.
    const flip: Record<string, Lease["renewalStatus"]> = {
      "L-WL-011": "renewed", "L-WL-012": "renewed", "L-WL-013": "renewed", "L-WL-015": "renewed", "L-WL-017": "declined",
      "L-WL-014": "declined", "L-WL-016": "declined", "L-WL-018": "declined",
    };
    const altered: Dataset = {
      ...dataset,
      leases: dataset.leases.map((l) => (flip[l.id] ? { ...l, renewalStatus: flip[l.id] } : l)),
    };
    const packet = buildEvidencePacket(WL, altered, AS_OF_DATE);
    expect(packet.support).toMatchObject({ renewalLags: true, hvacSlower: true, repeatMaintenanceRenewsLower: false });
    expect(packet.patternDetected).toBe(false);
    expect(packet.headline).not.toMatch(/repeated maintenance issues/);
    const text = packet.narrative.join(" ");
    expect(text).not.toMatch(/associated with residents|association in small groups/);
    expect(text).toContain("did not renew at a lower rate (80%, 4 of 5, vs 0%, 0 of 3)");
  });

  it("does not compare maintenance groups below the minimum size", () => {
    // Only 2 residents left in the "fewer than 2 work orders" group.
    const altered: Dataset = { ...dataset, leases: dataset.leases.filter((l) => l.id !== "L-WL-014") };
    const packet = buildEvidencePacket(WL, altered, AS_OF_DATE);
    expect(packet.support.maintenanceSplitSufficient).toBe(false);
    expect(packet.patternDetected).toBe(false);
    expect(packet.narrative.join(" ")).toContain("Too few renewal decisions to compare");
  });

  it("headline says 'repeated maintenance issues', not 'unresolved'", () => {
    const packet = buildEvidencePacket(WL, dataset, AS_OF_DATE);
    expect(packet.headline).toBe("Renewals among residents with repeated maintenance issues warrant review.");
    expect(packet.headline).not.toMatch(/unresolved/i);
  });

  it("repeat-maintenance residents had no open work order when they decided", () => {
    const split = renewalByMaintenanceHistory(WL, dataset, AS_OF_DATE);
    expect(split.repeatLeaseIds.length).toBeGreaterThan(0);
    for (const leaseId of split.repeatLeaseIds) {
      const l = dataset.leases.find((x) => x.id === leaseId)!;
      const wos = dataset.workOrders.filter((w) => w.residentId === l.residentId && split.repeatWorkOrderIds.includes(w.id));
      expect(wos.length).toBeGreaterThanOrEqual(2);
      for (const w of wos) expect(isOpenAsOf(w, l.renewalDecisionDate!), `${w.id} open at ${l.id} decision`).toBe(false);
    }
  });

  describe("maintenance-history provenance", () => {
    // Ben Achebe (L-WL-016, fewer-than-2 group) decided on 2026-07-30.
    const before = wo("WO-TEST-BEFORE", { residentId: "R-WL-016", createdAt: "2026-06-01", resolvedAt: "2026-06-03" });
    const after = wo("WO-TEST-AFTER", { residentId: "R-WL-016", createdAt: "2026-08-10", resolvedAt: "2026-08-12" });
    const tooEarly = wo("WO-TEST-EARLY", { residentId: "R-WL-016", createdAt: "2026-01-30", resolvedAt: "2026-02-02" }); // 181 days before
    const altered: Dataset = { ...dataset, workOrders: [...dataset.workOrders, before, after, tooEarly] };
    const claimSources = () =>
      buildEvidencePacket(WL, altered, AS_OF_DATE).claims.find((c) => c.id === "renewal-by-maintenance-history")!;

    it("cites comparison-group work orders from the lookback window", () => {
      const split = renewalByMaintenanceHistory(WL, altered, AS_OF_DATE);
      expect(split.otherLeaseIds).toContain("L-WL-016");
      expect(split.otherWorkOrderIds).toContain("WO-TEST-BEFORE");
      const claim = claimSources();
      expect(claim.sources.find((g) => g.label === "Work orders, fewer-than-2 group")!.ids).toContain("WO-TEST-BEFORE");
      expect(allSourceIds(claim)).toContain("WO-TEST-BEFORE");
    });

    it("excludes work orders created after the decision or before the lookback", () => {
      const ids = allSourceIds(claimSources());
      expect(ids).not.toContain("WO-TEST-AFTER");
      expect(ids).not.toContain("WO-TEST-EARLY");
    });

    it("leaves renewal rates unchanged", () => {
      const base = renewalByMaintenanceHistory(WL, dataset, AS_OF_DATE);
      const next = renewalByMaintenanceHistory(WL, altered, AS_OF_DATE);
      expect(next.repeat).toEqual(base.repeat);
      expect(next.other).toEqual(base.other);
    });
  });

  it("other properties do not show the pattern", () => {
    expect(buildEvidencePacket("p-lakeview", dataset, AS_OF_DATE).patternDetected).toBe(false);
  });

  it("Sarah's timeline is chronological and includes all three HVAC tickets", () => {
    const t = getResidentTimeline("R-WL-001", dataset);
    const dates = t.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
    const created = t.filter((e) => e.kind === "work_order_created").map((e) => e.sourceId);
    expect(created).toEqual(["WO-WL-1041", "WO-WL-1068", "WO-WL-1093"]);
  });
});
