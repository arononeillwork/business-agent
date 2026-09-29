"use client";

import { useSyncExternalStore } from "react";

// Checklist progress lives in localStorage for the demo. Swap for a Supabase table once accounts exist.
const KEY = "discover-spain:progress";
const listeners = new Set<() => void>();
let cache: string | null = null;

function read(): Record<string, number[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function snapshot() {
  try {
    cache = localStorage.getItem(KEY) ?? "{}";
  } catch {
    cache = "{}";
  }
  return cache;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useProgress(): Record<string, number[]> {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "{}");
  return JSON.parse(raw);
}

export function toggleStep(slug: string, index: number) {
  const all = read();
  const done = new Set(all[slug] ?? []);
  if (done.has(index)) done.delete(index);
  else done.add(index);
  all[slug] = [...done];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: progress just won't persist */
  }
  listeners.forEach((l) => l());
}
