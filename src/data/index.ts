import { generateComparisonProperties } from "./generated";
import type { Dataset } from "./types";
import {
  westLoopFeedback,
  westLoopInteractions,
  westLoopLeases,
  westLoopProperty,
  westLoopResidents,
  westLoopWorkOrders,
} from "./westLoop";

/** Fixed dataset clock. Every relative figure ("open 24 days") is measured to this date. */
export const AS_OF_DATE = "2026-09-26";

const generated = generateComparisonProperties(AS_OF_DATE);

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

export const dataset: Dataset = {
  asOfDate: AS_OF_DATE,
  properties: [westLoopProperty, ...generated.properties],
  residents: [...westLoopResidents, ...generated.residents],
  leases: [...westLoopLeases, ...generated.leases],
  workOrders: [...westLoopWorkOrders, ...generated.workOrders].sort(byId),
  feedback: [...westLoopFeedback, ...generated.feedback],
  interactions: [...westLoopInteractions, ...generated.interactions],
};

export * from "./types";
