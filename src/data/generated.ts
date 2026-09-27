/**
 * Deterministic synthetic records for the seven comparison properties.
 *
 * A seeded PRNG (mulberry32) makes the output identical on every run and
 * machine. Renewal outcomes use fixed per-property quotas so rates are
 * stable; dates, rents and maintenance activity vary within realistic bands.
 */
import { addDays } from "@/lib/dates";
import type {
  Feedback,
  Interaction,
  ISODate,
  Lease,
  Property,
  Resident,
  WorkOrder,
  WorkOrderCategory,
} from "./types";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Profile {
  property: Property;
  code: string;
  seed: number;
  baseRent: number;
  /** Renewed count among the six in-window decisions. */
  renewedInWindow: number;
}

// prettier-ignore
const PROFILES: Profile[] = [
  { property: { id: "p-lakeview",   name: "Belmont Harbor Flats",     neighborhood: "Lakeview",     unitCount: 184, occupiedUnits: 176 }, code: "LV", seed: 11, baseRent: 2350, renewedInWindow: 5 },
  { property: { id: "p-logan",      name: "Kedzie Boulevard Lofts",   neighborhood: "Logan Square", unitCount: 156, occupiedUnits: 147 }, code: "LS", seed: 23, baseRent: 2150, renewedInWindow: 4 },
  { property: { id: "p-hydepark",   name: "Midway Park Commons",      neighborhood: "Hyde Park",    unitCount: 212, occupiedUnits: 199 }, code: "HP", seed: 37, baseRent: 1950, renewedInWindow: 4 },
  { property: { id: "p-evanston",   name: "Sheridan Crossing",        neighborhood: "Evanston",     unitCount: 140, occupiedUnits: 134 }, code: "EV", seed: 41, baseRent: 2250, renewedInWindow: 5 },
  { property: { id: "p-pilsen",     name: "18th Street Works",        neighborhood: "Pilsen",       unitCount: 120, occupiedUnits: 111 }, code: "PI", seed: 53, baseRent: 1850, renewedInWindow: 4 },
  { property: { id: "p-southloop",  name: "Printers Row Tower",       neighborhood: "South Loop",   unitCount: 268, occupiedUnits: 251 }, code: "SL", seed: 67, baseRent: 2500, renewedInWindow: 5 },
  { property: { id: "p-oakpark",    name: "Marion Street Residences", neighborhood: "Oak Park",     unitCount: 96,  occupiedUnits: 92 },  code: "OP", seed: 79, baseRent: 2050, renewedInWindow: 4 },
];

const FIRST = ["Alex", "Bianca", "Caleb", "Dana", "Emeka", "Farah", "Gabe", "Hana", "Isaac", "Jade", "Kiran", "Leah", "Mateo", "Nia", "Omar", "Paige", "Quinn", "Rosa", "Seth", "Tara", "Uma", "Wes", "Yara", "Zane"];
const LAST = ["Abbott", "Barros", "Cho", "Delaney", "Eklund", "Fontaine", "Gupta", "Holm", "Ibarra", "Jansen", "Kimura", "Lindqvist", "Moreau", "Nakamura", "Okafor", "Petrov", "Quintero", "Rasmussen", "Sato", "Thornton", "Umeh", "Valdez", "Whitaker", "Yilmaz"];

const WO_SUMMARIES: Record<WorkOrderCategory, string[]> = {
  HVAC: ["AC not cooling", "Thermostat unresponsive", "Filter replacement request"],
  Plumbing: ["Slow kitchen drain", "Running toilet", "Low water pressure in shower"],
  Appliance: ["Dishwasher not draining", "Oven igniter failing", "Dryer not heating"],
  Electrical: ["Outlet not working", "Light fixture flickering"],
  Pest: ["Ants in kitchen"],
  General: ["Door closer adjustment", "Window screen torn"],
};
const CATEGORIES: WorkOrderCategory[] = ["HVAC", "HVAC", "Plumbing", "Plumbing", "Appliance", "Electrical", "Pest", "General"];

const FEEDBACK_TEXT: Record<number, string[]> = {
  2: ["Took a while to hear back about a repair."],
  3: ["Fine overall; amenity hours could be longer.", "Parking garage lighting could be better."],
  4: ["Maintenance was quick and friendly.", "Happy with the building."],
  5: ["Great management team.", "Repairs are always handled fast."],
};

type Slot = "decided-in-window" | "decided-old" | "pending-soon" | "pending-later";
const SLOTS: Slot[] = [
  ...Array<Slot>(6).fill("decided-in-window"),
  "decided-old",
  ...Array<Slot>(4).fill("pending-soon"),
  "pending-later",
];

export interface GeneratedRecords {
  properties: Property[];
  residents: Resident[];
  leases: Lease[];
  workOrders: WorkOrder[];
  feedback: Feedback[];
  interactions: Interaction[];
}

export function generateComparisonProperties(asOfDate: ISODate): GeneratedRecords {
  const out: GeneratedRecords = {
    properties: [],
    residents: [],
    leases: [],
    workOrders: [],
    feedback: [],
    interactions: [],
  };
  let nameIndex = 0;
  let woSeq = 2000;
  let ixSeq = 500;
  let fbSeq = 400;

  for (const profile of PROFILES) {
    const rand = mulberry32(profile.seed);
    const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
    const { property, code } = profile;
    out.properties.push(property);

    // Renewed/declined assignment for the in-window decisions, shuffled deterministically.
    const outcomes = [
      ...Array(profile.renewedInWindow).fill("renewed"),
      ...Array(6 - profile.renewedInWindow).fill("declined"),
    ] as ("renewed" | "declined")[];
    for (let i = outcomes.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
    }

    SLOTS.forEach((slot, i) => {
      const n = String(i + 1).padStart(3, "0");
      const residentId = `R-${code}-${n}`;
      const name = `${FIRST[nameIndex % FIRST.length]} ${LAST[(nameIndex * 7) % LAST.length]}`;
      nameIndex++;
      const unit = `${int(2, 18)}${String(int(1, 12)).padStart(2, "0")}`;
      out.residents.push({
        id: residentId,
        propertyId: property.id,
        name,
        unit,
        preferences: { contactChannel: rand() < 0.75 ? "email" : "sms" },
      });

      let endDate: ISODate;
      let renewalStatus: Lease["renewalStatus"] = "pending";
      let decisionDate: ISODate | undefined;
      if (slot === "decided-in-window") {
        decisionDate = addDays(asOfDate, -int(3, 88));
        endDate = addDays(decisionDate, int(30, 60));
        renewalStatus = outcomes.shift()!;
      } else if (slot === "decided-old") {
        decisionDate = addDays(asOfDate, -int(100, 140));
        endDate = addDays(decisionDate, int(30, 60));
        renewalStatus = "renewed";
      } else if (slot === "pending-soon") {
        endDate = addDays(asOfDate, int(5, 88));
      } else {
        endDate = addDays(asOfDate, int(100, 150));
      }
      const rent = Math.round((profile.baseRent + int(-250, 350)) / 5) * 5;
      out.leases.push({
        id: `L-${code}-${n}`,
        residentId,
        monthlyRent: rent,
        startDate: addDays(endDate, -364),
        endDate,
        renewalStatus,
        ...(decisionDate ? { renewalDecisionDate: decisionDate } : {}),
      });

      // Maintenance: most residents have none; a few have one or two quickly resolved tickets.
      const r = rand();
      const woCount = r < 0.66 ? 0 : r < 0.93 ? 1 : 2;
      for (let w = 0; w < woCount; w++) {
        const category = pick(CATEGORIES);
        const createdAt = addDays(asOfDate, -int(1, 170));
        const resolvedAt = addDays(createdAt, int(1, 5));
        const open = resolvedAt > asOfDate;
        out.workOrders.push({
          id: `WO-${code}-${woSeq++}`,
          residentId,
          category,
          priority: rand() < 0.2 ? "high" : rand() < 0.6 ? "medium" : "low",
          summary: pick(WO_SUMMARIES[category]),
          createdAt,
          status: open ? "open" : "resolved",
          ...(open ? {} : { resolvedAt }),
        });
      }

      if (rand() < 0.45) {
        const fr = rand();
        const rating = (fr < 0.08 ? 2 : fr < 0.3 ? 3 : fr < 0.7 ? 4 : 5) as Feedback["rating"];
        out.feedback.push({
          id: `FB-${code}-${fbSeq++}`,
          residentId,
          createdAt: addDays(asOfDate, -int(5, 160)),
          rating,
          text: pick(FEEDBACK_TEXT[rating]),
        });
      }

      // Renewal outreach ~60 days before lease end, when that date has already passed.
      const offerDate = addDays(endDate, -60);
      const decisionOrAsOf = decisionDate ?? asOfDate;
      const sentAt = offerDate <= decisionOrAsOf ? offerDate : addDays(decisionOrAsOf, -14);
      if (sentAt <= asOfDate) {
        const responded = renewalStatus !== "pending" || rand() < 0.7;
        out.interactions.push({
          id: `IX-${code}-${ixSeq++}`,
          residentId,
          createdAt: sentAt,
          type: "renewal_offer",
          status: responded ? "responded" : "no_response",
          summary:
            renewalStatus === "renewed"
              ? "Accepted 12-month renewal."
              : renewalStatus === "declined"
                ? "Declined renewal; relocating."
                : responded
                  ? "Resident acknowledged offer; decision pending."
                  : "Renewal offer emailed. No reply recorded.",
        });
      }
    });
  }
  return out;
}
