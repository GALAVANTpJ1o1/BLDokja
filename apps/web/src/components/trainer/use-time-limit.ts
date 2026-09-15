"use client";

import type { Difficulty } from "@bld/storage";
import { useEffect } from "react";

/**
 * A hard cutoff for a recall prompt (BRIEF §7.7): when the difficulty settings set one, `onExpire` runs
 * once the time passes without an answer. `key` restarts the clock (a new case). Soft targets and no
 * limit never fire; they're judged when the answer comes (`timeVerdict`).
 */
export function useHardCutoff(difficulty: Difficulty | undefined, key: string | undefined, active: boolean, onExpire: () => void): void {
  const seconds = difficulty?.time?.mode === "hard" ? difficulty.time.seconds : undefined;
  useEffect(() => {
    if (seconds === undefined || key === undefined || !active) return;
    const timer = window.setTimeout(onExpire, seconds * 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [seconds, key, active, onExpire]);
}
