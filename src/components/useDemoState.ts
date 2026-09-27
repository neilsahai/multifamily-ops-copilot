"use client";

import { useSyncExternalStore } from "react";
import { demoStore, type DemoState } from "@/lib/demoState";

export function useDemoState(): [DemoState, (next: DemoState) => void] {
  const state = useSyncExternalStore(demoStore.subscribe, demoStore.getSnapshot, demoStore.getServerSnapshot);
  return [state, demoStore.set];
}
