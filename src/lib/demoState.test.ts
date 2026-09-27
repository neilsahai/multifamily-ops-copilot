import { describe, expect, it } from "vitest";
import { dataset, AS_OF_DATE } from "@/data";
import { draftEscalation, draftFeedbackFollowUp, draftOutreach, escalationCandidates } from "./actions";
import { evaluateResidentFlag } from "./analytics";
import { createTask, INITIAL_STATE, parseState, resetState, saveOutreachDraft, type TaskInput } from "./demoState";

const input: TaskInput = {
  kind: "maintenance_escalation",
  residentId: "R-WL-001",
  workOrderId: "WO-WL-1093",
  title: "  Escalate repeat HVAC issue — Unit 1704 ",
  priority: "Urgent",
  assignee: "Maintenance supervisor",
  reason: "Third HVAC ticket",
  notes: "",
};

describe("demo task state", () => {
  it("creates a simulated task with a sequential ID without mutating prior state", () => {
    const { state, task } = createTask(INITIAL_STATE, input, "2026-09-26");
    expect(task.id).toBe("DEMO-TASK-001");
    expect(task.title).toBe("Escalate repeat HVAC issue — Unit 1704");
    expect(task.status).toBe("created (simulated)");
    expect(state.tasks).toHaveLength(1);
    expect(INITIAL_STATE.tasks).toHaveLength(0);
    const second = createTask(state, input, "2026-09-26");
    expect(second.task.id).toBe("DEMO-TASK-002");
    expect(second.state.tasks.map((t) => t.id)).toEqual(["DEMO-TASK-002", "DEMO-TASK-001"]);
  });

  it("rejects an empty title", () => {
    expect(() => createTask(INITIAL_STATE, { ...input, title: "   " }, "2026-09-26")).toThrow();
  });

  it("saves outreach as a draft only", () => {
    const { state, draft } = saveOutreachDraft(
      INITIAL_STATE,
      { residentId: "R-WL-001", channel: "email", message: "Hi Sarah" },
      "2026-09-26",
    );
    expect(draft.status).toBe("draft (not sent)");
    expect(state.outreachDrafts).toHaveLength(1);
  });

  it("reset restores the initial state", () => {
    const { state } = createTask(INITIAL_STATE, input, "2026-09-26");
    expect(state).not.toEqual(INITIAL_STATE);
    expect(resetState()).toEqual(INITIAL_STATE);
  });

  it("round-trips through storage and ignores corrupt data", () => {
    const { state } = createTask(INITIAL_STATE, input, "2026-09-26");
    expect(parseState(JSON.stringify(state))).toEqual(state);
    expect(parseState(null)).toBe(INITIAL_STATE);
    expect(parseState("{not json")).toBe(INITIAL_STATE);
    expect(parseState(JSON.stringify({ version: 2 }))).toBe(INITIAL_STATE);
  });
});

describe("parseState validation", () => {
  const valid = createTask(INITIAL_STATE, input, "2026-09-26").state;
  const bad = (patch: object) => parseState(JSON.stringify({ ...valid, ...patch }));

  it("rejects malformed items, sequences and duplicate IDs", () => {
    expect(bad({ tasks: [null] })).toBe(INITIAL_STATE);
    expect(bad({ tasks: [{ ...valid.tasks[0], priority: "Whenever" }] })).toBe(INITIAL_STATE);
    expect(bad({ tasks: [{ ...valid.tasks[0], createdAt: "yesterday" }] })).toBe(INITIAL_STATE);
    expect(bad({ tasks: [{ ...valid.tasks[0], workOrderId: undefined }] })).toBe(INITIAL_STATE);
    expect(bad({ outreachDrafts: [{ id: "x" }] })).toBe(INITIAL_STATE);
    expect(bad({ nextSeq: 0 })).toBe(INITIAL_STATE);
    expect(bad({ nextSeq: 1.5 })).toBe(INITIAL_STATE);
    expect(bad({ nextSeq: 1 })).toBe(INITIAL_STATE); // would reissue DEMO-TASK-001
    expect(bad({ tasks: [valid.tasks[0], valid.tasks[0]], nextSeq: 9 })).toBe(INITIAL_STATE);
    expect(parseState("null")).toBe(INITIAL_STATE);
  });

  it("requires the linked record for each task kind", () => {
    expect(() => createTask(INITIAL_STATE, { ...input, workOrderId: undefined }, "2026-09-26")).toThrow();
    expect(() => createTask(INITIAL_STATE, { ...input, kind: "feedback_follow_up", workOrderId: undefined }, "2026-09-26")).toThrow();
  });
});

describe("drafts", () => {
  const ev = (id: string) => evaluateResidentFlag(id, dataset, AS_OF_DATE)!;
  const sarah = ev("R-WL-001");

  it("pre-fills an escalation from Sarah's evidence", () => {
    const d = draftEscalation(sarah, AS_OF_DATE)!;
    expect(d.workOrderId).toBe("WO-WL-1093");
    expect(d.priority).toBe("Urgent");
    expect(d.title).toBe("Escalate repeat HVAC issue — Unit 1704");
    expect(d.reason).toContain("3 HVAC work orders since Jun 14, 2026");
    expect(d.reason).toContain("open 24 days as of Sep 26, 2026");
    const { task } = createTask(INITIAL_STATE, d, AS_OF_DATE);
    expect(task.workOrderId).toBe("WO-WL-1093");
  });

  it("never escalates a resolved or unrelated work order for feedback-only residents", () => {
    for (const id of ["R-WL-003", "R-WL-005"]) {
      const e = ev(id); // Priya (mechanical-room noise), Elena (package room / elevator)
      expect(escalationCandidates(e)).toEqual([]);
      expect(draftEscalation(e, AS_OF_DATE)).toBeNull();
      expect(draftEscalation(e, AS_OF_DATE, id === "R-WL-003" ? "WO-WL-1060" : "WO-WL-1083")).toBeNull();
      const f = draftFeedbackFollowUp(e)!;
      expect(f.kind).toBe("feedback_follow_up");
      expect(f.workOrderId).toBeUndefined();
      expect(f.feedbackId).toBe(e.lowFeedback[0].id);
      expect(f.reason).toContain("not linked to a work order");
    }
  });

  it("only says 'repeat' when the same category recurs", () => {
    const daniel = draftEscalation(ev("R-WL-004"), AS_OF_DATE)!; // HVAC then Plumbing
    expect(daniel.title).toBe("Escalate open Plumbing work order — Unit 2102");
    expect(daniel.title).not.toMatch(/repeat/i);
    expect(daniel.reason).toContain("2 maintenance requests in the past 180 days across HVAC, Plumbing");
  });

  it("derives every field from the selected open work order", () => {
    const jordan = ev("R-WL-006");
    expect(escalationCandidates(jordan).map((w) => w.id)).toEqual(["WO-WL-1098", "WO-WL-1109"]);
    const hvac = draftEscalation(jordan, AS_OF_DATE, "WO-WL-1098")!;
    const plumbing = draftEscalation(jordan, AS_OF_DATE, "WO-WL-1109")!;
    expect(hvac).toMatchObject({ workOrderId: "WO-WL-1098", title: "Escalate repeat HVAC issue — Unit 1507", priority: "Urgent" });
    expect(plumbing).toMatchObject({
      workOrderId: "WO-WL-1109",
      title: "Escalate open Plumbing work order — Unit 1507",
      priority: "High",
      assignee: "Plumbing technician (on-site maintenance)",
    });
    expect(plumbing.reason).toContain("WO-WL-1109 (Bathroom sink draining slowly) open 8 days");
    expect(plumbing.reason).not.toContain("WO-WL-1098 (");
  });

  it("outreach for an open repair asks to confirm status and makes no commitments", () => {
    const d = draftOutreach(sarah);
    expect(d.message).toContain("WO-WL-1093");
    expect(d.message).toContain("confirm whether it is still unresolved");
    expect(d.message).not.toMatch(/no need to decide|will confirm a visit|prioritizing/i);
  });

  it("outreach for a feedback-only concern does not mention a work order", () => {
    const d = draftOutreach(ev("R-WL-003"));
    expect(d.message).toContain("feedback you shared on Aug 28, 2026");
    expect(d.message).toContain("coordinate the appropriate next step");
    expect(d.message).not.toMatch(/WO-|work order|no need to decide/i);
  });
});
