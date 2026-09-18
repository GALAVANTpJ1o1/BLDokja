"use client";

import { DrillAttemptEventSchema, type AppEvent, type DrillAttemptEvent, type Settings } from "@bld/storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { currentAccountId, getStorage } from "./storage-client";
import { nowIso } from "./ids";

/**
 * The settings in force when an attempt was made (BRIEF §8: "settings snapshot"): the difficulty
 * settings, your buffers (or "standard"), and which lettering scheme. Enough to tell later whether a slow
 * week was a harder preset or a new buffer.
 */
export function settingsSnapshot(stored: Settings | undefined): NonNullable<DrillAttemptEvent["settings"]> {
  // Round-tripped through JSON (dropping undefined fields) and parsed with the event schema, so the
  // snapshot is exactly what will be stored.
  const plain: unknown = JSON.parse(JSON.stringify({ difficulty: stored?.difficulty ?? {}, buffers: stored?.buffers ?? "standard", scheme: stored?.scheme?.id ?? "speffz" }));
  const parsed = DrillAttemptEventSchema.shape.settings.unwrap().safeParse(plain);
  return parsed.success ? parsed.data : { scheme: stored?.scheme?.id ?? "speffz" };
}

/**
 * The event log, loaded once, with an `append` that writes through storage and updates the local copy.
 * Trainers read their history from it (FSRS schedules, explanation counts) and log every graded attempt;
 * a drill attempt without a settings snapshot gets one here, so no trainer can forget it.
 */
export function useEvents(): { events: readonly AppEvent[] | undefined; append: (events: readonly AppEvent[]) => Promise<void> } {
  const [events, setEvents] = useState<readonly AppEvent[] | undefined>(undefined);
  const { stored } = useSettings();
  const latest = useRef(stored);
  useEffect(() => {
    latest.current = stored;
  }, [stored]);
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
    const withSettings = added.map((e) => (e.type === "drill.attempt" && e.settings === undefined ? { ...e, settings: settingsSnapshot(latest.current) } : e));
    const storage = getStorage();
    await storage.appendEvents(withSettings);
    setEvents((current) => [...(current ?? []), ...withSettings]);
    // Queued for the sync engine to push, only when signed in -- a guest's events never leave the
    // device, so there's nothing to enqueue (v2 §D: guest data stays local-only by default).
    if (currentAccountId() !== undefined) {
      const queuedAt = nowIso();
      await Promise.all(withSettings.map((e) => storage.enqueueOutbox({ id: `event:${e.id}`, kind: "event", recordId: e.id, queuedAt })));
    }
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
