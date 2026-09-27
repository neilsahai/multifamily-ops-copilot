/**
 * Hand-curated records for the fictional West Loop property — the
 * investigation target. Every name, unit, identifier and comment is invented.
 */
import type {
  Feedback,
  Interaction,
  Lease,
  Property,
  Resident,
  WorkOrder,
} from "./types";

export const westLoopProperty: Property = {
  id: "p-westloop",
  name: "Carroll Avenue Yards",
  neighborhood: "West Loop",
  unitCount: 224,
  occupiedUnits: 211,
};

const P = westLoopProperty.id;

type ResidentRow = [
  id: string,
  name: string,
  unit: string,
  rent: number,
  start: string,
  end: string,
  status: Lease["renewalStatus"],
  decision?: string,
];

// prettier-ignore
const rows: ResidentRow[] = [
  // Pending renewals
  ["R-WL-001", "Sarah Chen",        "1704", 2850, "2025-11-01", "2026-10-31", "pending"],
  ["R-WL-002", "Marcus Oyelaran",   "1210", 2640, "2025-11-16", "2026-11-15", "pending"],
  ["R-WL-003", "Priya Raman",       "0805", 2410, "2025-10-16", "2026-10-15", "pending"],
  ["R-WL-004", "Daniel Kowalski",   "2102", 3120, "2025-12-11", "2026-12-10", "pending"],
  ["R-WL-005", "Elena Vasquez",     "0412", 2280, "2025-10-21", "2026-10-20", "pending"],
  ["R-WL-006", "Jordan Whitfield",  "1507", 2760, "2025-12-01", "2026-11-30", "pending"],
  ["R-WL-007", "Aisha Mbeki",       "0910", 2520, "2025-11-06", "2026-11-05", "pending"],
  ["R-WL-008", "Tomás Reyes",       "1102", 2590, "2025-11-21", "2026-11-20", "pending"],
  ["R-WL-009", "Grace Liu",         "1901", 2980, "2026-03-01", "2027-02-28", "pending"],
  ["R-WL-010", "Kevin Brandt",      "0306", 2190, "2025-10-11", "2026-10-10", "pending"],
  // Decided renewals
  ["R-WL-011", "Hannah Park",       "1406", 2700, "2025-10-01", "2026-09-30", "declined", "2026-08-05"],
  ["R-WL-012", "Victor Adeyemi",    "1112", 2620, "2025-10-16", "2026-10-15", "declined", "2026-08-20"],
  ["R-WL-013", "Olivia Grant",      "0702", 2350, "2025-09-01", "2026-08-31", "declined", "2026-07-15"],
  ["R-WL-014", "Samuel Ortiz",      "2003", 3050, "2025-11-01", "2026-10-31", "declined", "2026-09-10"],
  ["R-WL-015", "Maya Johansson",    "1609", 2790, "2025-10-01", "2026-09-30", "declined", "2026-09-01"],
  ["R-WL-016", "Ben Achebe",        "0508", 2300, "2025-09-16", "2026-09-15", "renewed",  "2026-07-30"],
  ["R-WL-017", "Lucy Tran",         "1303", 2560, "2025-10-26", "2026-10-25", "renewed",  "2026-08-25"],
  ["R-WL-018", "Noah Feldman",      "1801", 2880, "2025-11-11", "2026-11-10", "renewed",  "2026-09-15"],
  ["R-WL-019", "Irene Castellano",  "0601", 2400, "2025-08-01", "2026-07-31", "renewed",  "2026-06-10"],
];

export const westLoopResidents: Resident[] = rows.map(([id, name, unit]) => ({
  id,
  propertyId: P,
  name,
  unit,
  preferences: { contactChannel: id === "R-WL-002" ? "sms" : "email" },
}));

export const westLoopLeases: Lease[] = rows.map(
  ([id, , , rent, start, end, status, decision]) => ({
    id: id.replace("R-", "L-"),
    residentId: id,
    monthlyRent: rent,
    startDate: start,
    endDate: end,
    renewalStatus: status,
    ...(decision ? { renewalDecisionDate: decision } : {}),
  }),
);

type WoRow = [
  id: string,
  residentId: string,
  category: WorkOrder["category"],
  priority: WorkOrder["priority"],
  created: string,
  resolved: string | null,
  summary: string,
];

// prettier-ignore
const woRows: WoRow[] = [
  ["WO-WL-1041", "R-WL-001", "HVAC", "medium", "2026-06-14", "2026-06-29", "Bedroom AC not cooling"],
  ["WO-WL-1068", "R-WL-001", "HVAC", "high",   "2026-07-22", "2026-08-11", "AC short-cycling; unit reaching 82°F in afternoons"],
  ["WO-WL-1093", "R-WL-001", "HVAC", "high",   "2026-09-02", null,         "AC not cooling again; rattling from air handler"],
  ["WO-WL-1052", "R-WL-002", "HVAC", "medium", "2026-07-03", "2026-07-17", "Thermostat unresponsive"],
  ["WO-WL-1101", "R-WL-002", "HVAC", "medium", "2026-09-14", null,         "Heat-pump fan runs constantly"],
  ["WO-WL-1060", "R-WL-003", "Plumbing", "low", "2026-07-12", "2026-07-15", "Slow bathroom drain"],
  ["WO-WL-1074", "R-WL-004", "HVAC", "medium", "2026-08-04", "2026-08-21", "Living-room vent blowing warm air"],
  ["WO-WL-1107", "R-WL-004", "Plumbing", "medium", "2026-09-17", null,     "Leak under kitchen sink cabinet"],
  ["WO-WL-1083", "R-WL-005", "Appliance", "low", "2026-08-18", "2026-08-20", "Dishwasher not draining"],
  ["WO-WL-1047", "R-WL-006", "HVAC", "medium", "2026-06-22", "2026-07-10", "AC not cooling"],
  ["WO-WL-1079", "R-WL-006", "HVAC", "high",   "2026-08-10", "2026-08-27", "Condensate leak from AC closet"],
  ["WO-WL-1098", "R-WL-006", "HVAC", "high",   "2026-09-08", null,         "AC not cooling; same unit as prior tickets"],
  ["WO-WL-1109", "R-WL-006", "Plumbing", "medium", "2026-09-18", null,     "Bathroom sink draining slowly"],
  ["WO-WL-1088", "R-WL-007", "Electrical", "low", "2026-08-24", "2026-08-26", "Bathroom GFCI outlet tripping"],
  ["WO-WL-1112", "R-WL-007", "HVAC", "medium", "2026-09-21", null,         "Thermostat display blank"],
  ["WO-WL-1102", "R-WL-008", "HVAC", "medium", "2026-09-06", null,         "Weak airflow from bedroom vent"],
  ["WO-WL-1085", "R-WL-009", "HVAC", "medium", "2026-08-20", "2026-09-04", "AC not cooling"],
  ["WO-WL-1104", "R-WL-009", "HVAC", "medium", "2026-09-15", null,         "Air handler noise"],
  ["WO-WL-1022", "R-WL-011", "HVAC", "medium", "2026-05-18", "2026-06-05", "AC not cooling"],
  ["WO-WL-1049", "R-WL-011", "HVAC", "high",   "2026-06-25", "2026-07-14", "AC not cooling; repeat visit"],
  ["WO-WL-1018", "R-WL-012", "HVAC", "medium", "2026-05-06", "2026-05-22", "Thermostat not holding setpoint"],
  ["WO-WL-1044", "R-WL-012", "HVAC", "medium", "2026-06-18", "2026-07-06", "AC not cooling"],
  ["WO-WL-1066", "R-WL-012", "HVAC", "high",   "2026-07-20", "2026-08-07", "AC not cooling; third report"],
  ["WO-WL-1011", "R-WL-013", "Plumbing", "low", "2026-04-14", "2026-04-20", "Running toilet"],
  ["WO-WL-1036", "R-WL-013", "HVAC", "medium", "2026-06-02", "2026-06-24", "AC blowing warm air"],
  ["WO-WL-1055", "R-WL-015", "HVAC", "medium", "2026-07-07", "2026-07-24", "AC not cooling"],
  ["WO-WL-1071", "R-WL-015", "HVAC", "high",   "2026-07-29", "2026-08-14", "AC failed again after repair"],
  ["WO-WL-1030", "R-WL-017", "Appliance", "low", "2026-05-27", "2026-05-29", "Refrigerator ice maker leaking"],
  ["WO-WL-1063", "R-WL-017", "Plumbing", "low", "2026-07-16", "2026-07-18", "Shower valve dripping"],
  ["WO-WL-1005", "R-WL-019", "General", "low", "2026-04-02", "2026-04-04", "Closet door off track"],
];

export const westLoopWorkOrders: WorkOrder[] = woRows.map(
  ([id, residentId, category, priority, created, resolved, summary]) => ({
    id,
    residentId,
    category,
    priority,
    summary,
    createdAt: created,
    status: resolved ? "resolved" : "open",
    ...(resolved ? { resolvedAt: resolved } : {}),
  }),
);

export const westLoopFeedback: Feedback[] = [
  {
    id: "FB-WL-301",
    residentId: "R-WL-001",
    createdAt: "2026-08-13",
    rating: 2,
    text: "AC was fixed again, but it took almost three weeks and this is the second time this summer. Nobody told me when the technician was coming.",
  },
  {
    id: "FB-WL-302",
    residentId: "R-WL-003",
    createdAt: "2026-08-28",
    rating: 1,
    text: "Loud banging from the mechanical room above my unit most nights. Reported it to the front desk twice with no update.",
  },
  {
    id: "FB-WL-303",
    residentId: "R-WL-005",
    createdAt: "2026-09-05",
    rating: 2,
    text: "Package room and elevator outages have made the last month frustrating.",
  },
  {
    id: "FB-WL-304",
    residentId: "R-WL-006",
    createdAt: "2026-08-29",
    rating: 2,
    text: "Same AC problem keeps coming back. Each repair takes more than two weeks.",
  },
  {
    id: "FB-WL-305",
    residentId: "R-WL-010",
    createdAt: "2026-09-12",
    rating: 3,
    text: "Building is fine overall. Gym equipment is often out of order.",
  },
  {
    id: "FB-WL-306",
    residentId: "R-WL-011",
    createdAt: "2026-07-16",
    rating: 2,
    text: "Two AC outages in a heat wave. Took weeks each time.",
  },
  {
    id: "FB-WL-307",
    residentId: "R-WL-016",
    createdAt: "2026-07-02",
    rating: 5,
    text: "Front-desk team is great.",
  },
  {
    id: "FB-WL-308",
    residentId: "R-WL-018",
    createdAt: "2026-08-19",
    rating: 4,
    text: "Quiet building, good location.",
  },
];

type IxRow = [
  id: string,
  residentId: string,
  created: string,
  type: Interaction["type"],
  status: Interaction["status"],
  summary: string,
];

// prettier-ignore
const ixRows: IxRow[] = [
  ["IX-WL-201", "R-WL-001", "2026-08-31", "renewal_offer",      "no_response", "Renewal offer emailed: 12-month term at $2,935/mo (+3.0%)."],
  ["IX-WL-205", "R-WL-001", "2026-09-03", "maintenance_update", "completed",   "Automated notice: WO-WL-1093 received and queued."],
  ["IX-WL-214", "R-WL-001", "2026-09-14", "renewal_follow_up",  "no_response", "Follow-up email on renewal offer. No reply recorded."],
  ["IX-WL-218", "R-WL-002", "2026-09-15", "renewal_offer",      "no_response", "Renewal offer sent by SMS: 12-month term at $2,720/mo."],
  ["IX-WL-190", "R-WL-003", "2026-08-16", "renewal_offer",      "responded",   "Resident replied they are undecided until the noise issue is addressed."],
  ["IX-WL-188", "R-WL-005", "2026-08-21", "renewal_offer",      "no_response", "Renewal offer emailed: 12-month term at $2,350/mo."],
  ["IX-WL-207", "R-WL-005", "2026-09-08", "renewal_follow_up",  "no_response", "Follow-up email on renewal offer. No reply recorded."],
  ["IX-WL-226", "R-WL-006", "2026-09-24", "renewal_offer",      "no_response", "Renewal offer emailed: 12-month term at $2,845/mo."],
  ["IX-WL-209", "R-WL-007", "2026-09-06", "renewal_offer",      "responded",   "Resident asked about 15-month term options."],
  ["IX-WL-222", "R-WL-008", "2026-09-21", "renewal_offer",      "no_response", "Renewal offer emailed: 12-month term at $2,670/mo."],
  ["IX-WL-181", "R-WL-010", "2026-08-11", "renewal_offer",      "responded",   "Resident reviewing offer; expects to decide by Oct 1."],
  ["IX-WL-142", "R-WL-011", "2026-07-22", "renewal_offer",      "responded",   "Declined renewal; cited repeated AC outages."],
  ["IX-WL-151", "R-WL-012", "2026-08-06", "renewal_offer",      "responded",   "Declined renewal; moving to a building with newer HVAC."],
  ["IX-WL-128", "R-WL-013", "2026-07-02", "renewal_offer",      "responded",   "Declined renewal; no reason given."],
  ["IX-WL-176", "R-WL-014", "2026-08-28", "renewal_offer",      "responded",   "Declined renewal; cited rent increase and plans to buy a home."],
  ["IX-WL-170", "R-WL-015", "2026-08-15", "renewal_offer",      "responded",   "Declined renewal; cited maintenance response times."],
  ["IX-WL-133", "R-WL-016", "2026-07-17", "renewal_offer",      "responded",   "Accepted 12-month renewal."],
  ["IX-WL-163", "R-WL-017", "2026-08-12", "renewal_offer",      "responded",   "Accepted 12-month renewal."],
  ["IX-WL-196", "R-WL-018", "2026-09-02", "renewal_offer",      "responded",   "Accepted 12-month renewal."],
  ["IX-WL-102", "R-WL-019", "2026-06-01", "renewal_offer",      "responded",   "Accepted 12-month renewal."],
];

export const westLoopInteractions: Interaction[] = ixRows.map(
  ([id, residentId, created, type, status, summary]) => ({
    id,
    residentId,
    createdAt: created,
    type,
    status,
    summary,
  }),
);
