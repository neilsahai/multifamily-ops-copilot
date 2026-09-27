/**
 * Entity definitions for the synthetic operator dataset.
 *
 * These are a conceptual sample of the unified records an operator's
 * property-management, maintenance, survey and CRM systems might hold.
 * All dates are ISO calendar dates (YYYY-MM-DD) interpreted in UTC.
 */

export type ISODate = string;

export interface Property {
  id: string;
  name: string;
  neighborhood: string;
  unitCount: number;
  occupiedUnits: number;
}

export interface Resident {
  id: string;
  propertyId: string;
  name: string;
  unit: string;
  preferences?: {
    contactChannel: "email" | "sms" | "phone";
  };
}

export type RenewalStatus = "renewed" | "declined" | "pending";

export interface Lease {
  id: string;
  residentId: string;
  monthlyRent: number;
  startDate: ISODate;
  endDate: ISODate;
  renewalStatus: RenewalStatus;
  renewalDecisionDate?: ISODate;
}

export type WorkOrderCategory =
  | "HVAC"
  | "Plumbing"
  | "Appliance"
  | "Electrical"
  | "Pest"
  | "General";

export type WorkOrderPriority = "low" | "medium" | "high";

export interface WorkOrder {
  id: string;
  residentId: string;
  category: WorkOrderCategory;
  summary: string;
  createdAt: ISODate;
  resolvedAt?: ISODate;
  status: "open" | "resolved";
  priority: WorkOrderPriority;
}

export interface Feedback {
  id: string;
  residentId: string;
  createdAt: ISODate;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
}

export type InteractionType =
  | "renewal_offer"
  | "renewal_follow_up"
  | "maintenance_update";

export type InteractionStatus = "no_response" | "responded" | "completed";

export interface Interaction {
  id: string;
  residentId: string;
  createdAt: ISODate;
  type: InteractionType;
  status: InteractionStatus;
  summary: string;
}

export interface Dataset {
  asOfDate: ISODate;
  properties: Property[];
  residents: Resident[];
  leases: Lease[];
  workOrders: WorkOrder[];
  feedback: Feedback[];
  interactions: Interaction[];
}

/** A manager-approved task. Stored only in the browser; never sent anywhere. */
export interface DemoTask {
  id: string;
  /** Escalations target an open work order; follow-ups target a feedback record. */
  kind: "maintenance_escalation" | "feedback_follow_up";
  residentId: string;
  workOrderId?: string;
  feedbackId?: string;
  title: string;
  priority: "Urgent" | "High" | "Normal";
  assignee: string;
  reason: string;
  notes: string;
  createdAt: ISODate;
  status: "created (simulated)";
}

/** A resident message saved as a draft only. Never sent. */
export interface OutreachDraft {
  id: string;
  residentId: string;
  channel: "email" | "sms" | "phone";
  message: string;
  createdAt: ISODate;
  status: "draft (not sent)";
}
