"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ASSIGNEE_OPTIONS } from "@/lib/actions";
import { createTask, demoStore, saveOutreachDraft, type DraftInput, type TaskInput } from "@/lib/demoState";
import { formatDate } from "@/lib/dates";
import { Dialog } from "./Dialog";
import { Badge, Button, Card } from "./ui";
import { useDemoState } from "./useDemoState";

const input =
  "mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

type EditableField = "title" | "priority" | "assignee" | "reason" | "notes";
const FIELD_LABELS: Record<EditableField, string> = {
  title: "title",
  priority: "priority",
  assignee: "assignee",
  reason: "reason",
  notes: "notes",
};

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="block text-sm font-medium">{children}</label>;
}

function SimulatedNotice() {
  return (
    <p className="rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent-strong">
      <strong>Demo task · simulated action.</strong> Approving saves a task in this browser only. No email, SMS, resident
      contact or property-management system update happens.
    </p>
  );
}

/**
 * A copilot suggestion links to /residents/[id]?draft=escalation|feedback.
 * This only opens the existing pre-filled form once; the manager still edits
 * and approves it. Nothing is created from the URL.
 */
function DraftParam({ onDraft }: { onDraft: (kind: "escalation" | "feedback") => void }) {
  const params = useSearchParams();
  const draft = params.get("draft");
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    if (draft === "escalation" || draft === "feedback") onDraft(draft);
  }, [draft, onDraft]);
  return null;
}

export interface WorkOrderOption {
  id: string;
  label: string;
}

export function ResidentActions({
  residentLabel,
  escalationDrafts,
  workOrderOptions,
  feedbackFollowUp,
  outreach,
  asOfDate,
  hasOpenServiceIssue,
}: {
  residentLabel: string;
  /** One pre-filled draft per open work order, keyed by work-order ID. */
  escalationDrafts: Record<string, TaskInput>;
  /** Open work orders only, default (oldest) first. */
  workOrderOptions: WorkOrderOption[];
  feedbackFollowUp: TaskInput | null;
  outreach: DraftInput;
  asOfDate: string;
  hasOpenServiceIssue: boolean;
}) {
  const [state] = useDemoState();
  const [mode, setMode] = useState<"none" | "task" | "outreach">("none");
  const [task, setTask] = useState<TaskInput | null>(null);
  const [dirty, setDirty] = useState<Set<EditableField>>(new Set());
  const [staleFields, setStaleFields] = useState<EditableField[]>([]);
  const [draft, setDraft] = useState<DraftInput>(outreach);
  const [error, setError] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Derived from saved state, so a reset elsewhere removes the confirmation too.
  const confirmedTask = confirmedId ? state.tasks.find((t) => t.id === confirmedId) : undefined;
  const confirmedDraft = confirmedId ? state.outreachDrafts.find((d) => d.id === confirmedId) : undefined;

  const defaultEscalation = workOrderOptions[0] ? escalationDrafts[workOrderOptions[0].id] : undefined;

  const openTask = (initial: TaskInput) => {
    setTask(initial);
    setDirty(new Set());
    setStaleFields([]);
    setError(null);
    setMode("task");
  };
  const openOutreach = () => {
    setDraft(outreach);
    setError(null);
    setMode("outreach");
  };

  const edit = (field: EditableField, value: string) => {
    if (!task) return;
    setTask({ ...task, [field]: value });
    setDirty((d) => new Set(d).add(field));
    setStaleFields((s) => s.filter((f) => f !== field));
  };

  /** Regenerate every field the manager has not edited; flag the ones they have. */
  const selectWorkOrder = (workOrderId: string) => {
    if (!task) return;
    const next = escalationDrafts[workOrderId];
    if (!next) return;
    const merged: TaskInput = { ...next };
    for (const f of dirty) (merged as unknown as Record<EditableField, string>)[f] = task[f];
    setTask(merged);
    setStaleFields([...dirty]);
  };

  const confirm = (id: string) => {
    setConfirmedId(id);
    setMode("none");
    requestAnimationFrame(() => confirmRef.current?.focus());
  };

  const submitTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    if (!task.title.trim()) return setError("Add a task title before creating the task.");
    const result = createTask(demoStore.getSnapshot(), task, asOfDate);
    demoStore.set(result.state);
    confirm(result.task.id);
  };

  const submitDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.message.trim()) return setError("The message is empty.");
    const result = saveOutreachDraft(demoStore.getSnapshot(), draft, asOfDate);
    demoStore.set(result.state);
    confirm(result.draft.id);
  };

  const isEscalation = task?.kind === "maintenance_escalation";

  const openFromLink = (kind: "escalation" | "feedback") => {
    const initial = kind === "escalation" ? defaultEscalation : feedbackFollowUp;
    if (initial) openTask(initial);
  };

  return (
    <Card className="p-4 sm:p-5">
      <Suspense fallback={null}>
        <DraftParam onDraft={openFromLink} />
      </Suspense>
      <h2 className="font-semibold">Recommended next step</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        {hasOpenServiceIssue
          ? "Escalate the open work order for manager-approved follow-up before continuing renewal outreach."
          : feedbackFollowUp
            ? "No open work order is linked to this resident's concern. Have a manager follow up on the feedback first."
            : "No open service issue. Review the evidence before deciding on outreach."}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {defaultEscalation && (
          <Button onClick={() => openTask(defaultEscalation)}>Draft maintenance escalation</Button>
        )}
        {feedbackFollowUp && (
          <Button variant={defaultEscalation ? "secondary" : "primary"} onClick={() => openTask(feedbackFollowUp)}>
            Draft feedback follow-up
          </Button>
        )}
        <Button variant="secondary" onClick={openOutreach}>
          Draft outreach
        </Button>
      </div>
      {!defaultEscalation && (
        <p className="mt-2 text-xs text-ink-faint">No open work order on file, so there is nothing to escalate.</p>
      )}

      {(confirmedTask || confirmedDraft) && (
        <div
          ref={confirmRef}
          tabIndex={-1}
          role="status"
          className="mt-4 rounded-lg border border-accent/30 bg-accent-soft p-3 text-sm text-accent-strong"
        >
          {confirmedTask ? (
            <>
              <p className="font-semibold">✓ Demo task created (simulated)</p>
              <p className="mt-1">
                <code className="font-mono">{confirmedTask.id}</code> · {confirmedTask.priority} ·{" "}
                {confirmedTask.workOrderId ?? confirmedTask.feedbackId}
              </p>
              <p className="mt-0.5 text-xs">
                Assigned to {confirmedTask.assignee}. Saved in this browser on {formatDate(confirmedTask.createdAt)}.
                Nothing was sent.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">✓ Outreach saved as a draft (not sent)</p>
              <p className="mt-1"><code className="font-mono">{confirmedDraft!.id}</code> · {confirmedDraft!.channel}</p>
            </>
          )}
        </div>
      )}

      <Dialog
        open={mode === "task"}
        onClose={() => setMode("none")}
        title={isEscalation ? "Draft maintenance escalation" : "Draft feedback follow-up"}
        description={`Pre-filled from the records for ${residentLabel}. Edit anything before approving.`}
      >
        {task && (
          <form onSubmit={submitTask} className="space-y-4" noValidate>
            <SimulatedNotice />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="t-resident">Resident</Label>
                <input id="t-resident" className={`${input} bg-sunken`} value={residentLabel} readOnly />
              </div>
              {isEscalation ? (
                <div>
                  <Label htmlFor="t-wo">Open work order</Label>
                  <select id="t-wo" className={input} value={task.workOrderId} onChange={(e) => selectWorkOrder(e.target.value)}>
                    {workOrderOptions.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <Label htmlFor="t-fb">Feedback record</Label>
                  <input id="t-fb" className={`${input} bg-sunken`} value={task.feedbackId} readOnly />
                </div>
              )}
            </div>
            {staleFields.length > 0 && (
              <p role="alert" className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
                You changed the work order. Fields you had not edited were updated for {task.workOrderId}. You edited the{" "}
                {staleFields.map((f) => FIELD_LABELS[f]).join(", ")}, so {staleFields.length === 1 ? "it was" : "they were"} kept
                and may still describe the previous work order. Review before creating the task.
              </p>
            )}
            <div>
              <Label htmlFor="t-title">Task title</Label>
              <input id="t-title" className={input} value={task.title} onChange={(e) => edit("title", e.target.value)} aria-invalid={!!error && !task.title.trim()} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="t-priority">Priority</Label>
                <select id="t-priority" className={input} value={task.priority} onChange={(e) => edit("priority", e.target.value)}>
                  <option>Urgent</option>
                  <option>High</option>
                  <option>Normal</option>
                </select>
              </div>
              <div>
                <Label htmlFor="t-assignee">Suggested assignee</Label>
                <select id="t-assignee" className={input} value={task.assignee} onChange={(e) => edit("assignee", e.target.value)}>
                  {ASSIGNEE_OPTIONS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="t-reason">Reason (from records)</Label>
              <textarea id="t-reason" rows={4} className={input} value={task.reason} onChange={(e) => edit("reason", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="t-notes">Notes for assignee</Label>
              <textarea id="t-notes" rows={2} className={input} value={task.notes} onChange={(e) => edit("notes", e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-risk">{error}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setMode("none")}>Cancel</Button>
              <Button type="submit">Create task</Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        open={mode === "outreach"}
        onClose={() => setMode("none")}
        title="Draft resident outreach"
        description={`Saved as a draft for ${residentLabel}. It will not be sent.`}
      >
        <form onSubmit={submitDraft} className="space-y-4" noValidate>
          {(hasOpenServiceIssue || feedbackFollowUp) && (
            <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
              <strong>Address the service issue first.</strong> Renewal outreach while a concern is unresolved may land poorly.
              {hasOpenServiceIssue
                ? " Escalate the open work order, then review this draft once there is a confirmed next step."
                : " Follow up on the feedback, then review this draft."}{" "}
              The draft makes no commitments that aren&rsquo;t in the records; edit it to match what has actually been arranged.
            </p>
          )}
          <div>
            <Label htmlFor="o-channel">Preferred channel</Label>
            <select id="o-channel" className={input} value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value as DraftInput["channel"] })}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="phone">Phone call script</option>
            </select>
          </div>
          <div>
            <Label htmlFor="o-message">Message</Label>
            <textarea id="o-message" rows={10} className={input} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
          </div>
          {error && <p role="alert" className="text-sm text-risk">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Badge className="sm:mr-auto">Draft only · never sent</Badge>
            <Button variant="secondary" onClick={() => setMode("none")}>Cancel</Button>
            <Button type="submit">Save draft</Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
