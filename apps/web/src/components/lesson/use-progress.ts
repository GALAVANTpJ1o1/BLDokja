"use client";

import { useEffect, useState } from "react";
import { loadStorage } from "@/lib/storage-lazy";

export interface LessonProgress {
  /** Checkpoint ids passed, per lesson. */
  readonly passed: ReadonlyMap<string, ReadonlySet<string>>;
  readonly opened: ReadonlySet<string>;
}

/** Lesson progress from the event log. Refreshes when a checkpoint is passed on this page. */
export function useLessonProgress(): LessonProgress | undefined {
  const [progress, setProgress] = useState<LessonProgress | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void loadStorage()
        .then((storage) => storage.events())
        .then((events) => {
          if (cancelled) return;
          const passed = new Map<string, Set<string>>();
          const opened = new Set<string>();
          for (const e of events) {
            if (e.type === "lesson.checkpointPassed") {
              const set = passed.get(e.lessonId) ?? new Set<string>();
              set.add(e.checkpointId ?? "");
              passed.set(e.lessonId, set);
            } else if (e.type === "lesson.opened") opened.add(e.lessonId);
          }
          setProgress({ passed, opened });
        });
    };
    load();
    window.addEventListener("bld:progress", load);
    return () => {
      cancelled = true;
      window.removeEventListener("bld:progress", load);
    };
  }, []);
  return progress;
}

export function lessonDone(progress: LessonProgress | undefined, lessonId: string, checkpointIds: readonly string[]): boolean {
  const passed = progress?.passed.get(lessonId);
  return passed !== undefined && checkpointIds.every((id) => passed.has(id));
}
