"use client";

import type { AppEvent } from "@bld/storage";
import { useCallback, useEffect, useState } from "react";
import { getStorage } from "./storage-client";

/**
 * The event log, loaded once, with an `append` that writes through storage and updates the local copy.
 * Trainers read their history from it (FSRS schedules, explanation counts) and log every graded attempt.
 */
export function useEvents(): { events: readonly AppEvent[] | undefined; append: (events: readonly AppEvent[]) => Promise<void> } {
  const [events, setEvents] = useState<readonly AppEvent[] | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void getStorage()
      .events()
      .then((loaded) => {
        if (!cancelled) setEvents(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const append = useCallback(async (added: readonly AppEvent[]) => {
    await getStorage().appendEvents(added);
    setEvents((current) => [...(current ?? []), ...added]);
  }, []);
  return { events, append };
}

/** A small per-viewer preference kept in localStorage, falling back to the default when storage is blocked. */
export function readPreference<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: the preference just isn't remembered.
  }
}
