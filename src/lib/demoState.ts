/**
 * Simulated action state. Pure reducers plus a tiny localStorage-backed store.
 * Nothing here sends email/SMS or writes to any external system.
 */
import type { DemoTask, ISODate, OutreachDraft } from "@/data/types";

export const STORAGE_KEY = "moi-demo-state-v1";

export interface DemoState {
  version: 1;
  nextSeq: number;
  tasks: DemoTask[];
  outreachDrafts: OutreachDraft[];
}

export const INITIAL_STATE: DemoState = Object.freeze({
  version: 1,
  nextSeq: 1,
  tasks: [],
  outreachDrafts: [],
}) as DemoState;

export type TaskInput = Pick<
  DemoTask,
  "kind" | "residentId" | "workOrderId" | "feedbackId" | "title" | "priority" | "assignee" | "reason" | "notes"
>;

export function createTask(
  state: DemoState,
  input: TaskInput,
  createdAt: ISODate,
): { state: DemoState; task: DemoTask } {
  const title = input.title.trim();
  if (!title) throw new Error("Task title is required");
  if (input.kind === "maintenance_escalation" && !input.workOrderId)
    throw new Error("A maintenance escalation needs a work order");
  if (input.kind === "feedback_follow_up" && !input.feedbackId)
    throw new Error("A feedback follow-up needs a feedback record");
  const task: DemoTask = {
    ...input,
    title,
    id: `DEMO-TASK-${String(state.nextSeq).padStart(3, "0")}`,
    createdAt,
    status: "created (simulated)",
  };
  return { state: { ...state, nextSeq: state.nextSeq + 1, tasks: [task, ...state.tasks] }, task };
}

export type DraftInput = Pick<OutreachDraft, "residentId" | "channel" | "message">;

export function saveOutreachDraft(
  state: DemoState,
  input: DraftInput,
  createdAt: ISODate,
): { state: DemoState; draft: OutreachDraft } {
  const message = input.message.trim();
  if (!message) throw new Error("Message is required");
  const draft: OutreachDraft = {
    ...input,
    message,
    id: `DEMO-DRAFT-${String(state.nextSeq).padStart(3, "0")}`,
    createdAt,
    status: "draft (not sent)",
  };
  return {
    state: { ...state, nextSeq: state.nextSeq + 1, outreachDrafts: [draft, ...state.outreachDrafts] },
    draft,
  };
}

export function resetState(): DemoState {
  return INITIAL_STATE;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isStr = (v: unknown): v is string => typeof v === "string";
const optStr = (v: unknown) => v === undefined || isStr(v);

function isTask(v: unknown): v is DemoTask {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    isStr(t.id) &&
    (t.kind === "maintenance_escalation" || t.kind === "feedback_follow_up") &&
    isStr(t.residentId) &&
    optStr(t.workOrderId) &&
    optStr(t.feedbackId) &&
    (t.kind !== "maintenance_escalation" || isStr(t.workOrderId)) &&
    (t.kind !== "feedback_follow_up" || isStr(t.feedbackId)) &&
    isStr(t.title) &&
    (t.priority === "Urgent" || t.priority === "High" || t.priority === "Normal") &&
    isStr(t.assignee) &&
    isStr(t.reason) &&
    isStr(t.notes) &&
    isStr(t.createdAt) &&
    ISO_DATE.test(t.createdAt) &&
    t.status === "created (simulated)"
  );
}

function isDraft(v: unknown): v is OutreachDraft {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return (
    isStr(d.id) &&
    isStr(d.residentId) &&
    (d.channel === "email" || d.channel === "sms" || d.channel === "phone") &&
    isStr(d.message) &&
    isStr(d.createdAt) &&
    ISO_DATE.test(d.createdAt) &&
    d.status === "draft (not sent)"
  );
}

/**
 * Parse persisted state defensively. Any malformed item, duplicate ID or
 * invalid sequence falls back to the initial state rather than crashing.
 */
export function parseState(raw: string | null): DemoState {
  if (!raw) return INITIAL_STATE;
  try {
    const v = JSON.parse(raw) as Partial<DemoState> | null;
    if (
      !v ||
      v.version !== 1 ||
      !Array.isArray(v.tasks) ||
      !Array.isArray(v.outreachDrafts) ||
      !Number.isSafeInteger(v.nextSeq) ||
      (v.nextSeq as number) < 1 ||
      !v.tasks.every(isTask) ||
      !v.outreachDrafts.every(isDraft)
    ) {
      return INITIAL_STATE;
    }
    const ids = [...v.tasks, ...v.outreachDrafts].map((x) => x.id);
    if (new Set(ids).size !== ids.length || (v.nextSeq as number) <= ids.length) return INITIAL_STATE;
    return { version: 1, nextSeq: v.nextSeq as number, tasks: v.tasks, outreachDrafts: v.outreachDrafts };
  } catch {
    return INITIAL_STATE;
  }
}

// ---------- browser store (used via useSyncExternalStore) ----------

let current: DemoState = INITIAL_STATE;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    current = parseState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    current = INITIAL_STATE;
  }
}

export const demoStore = {
  getSnapshot(): DemoState {
    load();
    return current;
  },
  getServerSnapshot(): DemoState {
    return INITIAL_STATE;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        current = parseState(e.newValue);
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  set(next: DemoState) {
    current = next;
    try {
      if (next === INITIAL_STATE) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode etc.): state still lives for this session.
    }
    listeners.forEach((l) => l());
  },
};
