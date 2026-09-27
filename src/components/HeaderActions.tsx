"use client";

import { useState } from "react";
import { resetState } from "@/lib/demoState";
import { plural } from "@/lib/format";
import { Dialog } from "./Dialog";
import { Button } from "./ui";
import { useDemoState } from "./useDemoState";

export function HeaderActions() {
  const [state, setState] = useDemoState();
  const [confirming, setConfirming] = useState(false);
  const [announce, setAnnounce] = useState("");
  const changes = state.tasks.length + state.outreachDrafts.length;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-ink-muted sm:inline" aria-live="polite">
        {plural(state.tasks.length, "demo task")}
      </span>
      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        Reset demo
      </Button>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Reset demo?"
        description={
          changes > 0
            ? `This clears ${plural(state.tasks.length, "simulated task")} and ${plural(state.outreachDrafts.length, "outreach draft")} saved in this browser.`
            : "Nothing has been saved yet. Resetting restores the starting state."
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setState(resetState());
              setConfirming(false);
              setAnnounce("Demo reset to its starting state.");
            }}
          >
            Reset demo
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
