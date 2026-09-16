"use client";

import { cubingProvider, nextScramble, seededMoveProvider, seededStateProvider3x3, type Puzzle } from "@bld/cube-engine";
import { useEffect, useState } from "react";
import { polish } from "@/i18n/polish";
import { browserEventScramble, solveBrowserState } from "./browser-scramble";

export function useScramble(puzzle: Puzzle | undefined, seed: string, index: number, enabled = true) {
  const [quick, setQuick] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([puzzle?.id, seed, index, quick, retry]);
  const [result, setResult] = useState<{ key: string; scramble?: string; failed?: boolean }>();
  useEffect(() => {
    if (puzzle === undefined || !enabled) return;
    let disposed = false;
    const timeout = window.setTimeout(() => { if (!disposed) setResult({ key, failed: true }); }, 60_000);
    const provider = quick
      ? seededMoveProvider(puzzle, { seed: `${seed}#${index}`, ...(puzzle.id === "4x4x4" ? { moves: ["U", "D", "L", "R", "F", "B", "Uw", "Rw", "Fw"].flatMap((move) => [move, `${move}'`, `${move}2`]), length: 40 } : {}) })
      : puzzle.id === "3x3x3"
        ? seededStateProvider3x3(puzzle, { seed: `${seed}#${index}`, orientation: "none", solve: solveBrowserState })
        : cubingProvider(puzzle, puzzle.id === "5x5x5" ? "555bf" : "444bf", browserEventScramble);
    void nextScramble(provider).then(({ scramble }) => {
      window.clearTimeout(timeout);
      if (!disposed) setResult({ key, scramble });
    }).catch(() => {
      window.clearTimeout(timeout);
      if (!disposed) setResult({ key, failed: true });
    });
    return () => { disposed = true; window.clearTimeout(timeout); };
  }, [puzzle, seed, index, quick, retry, enabled, key]);
  return { scramble: result?.key === key ? result.scramble : undefined, failed: result?.key === key && result.failed === true, quick, setQuick, retry: () => { setRetry((value) => value + 1); } };
}

export function ScrambleControls({ state, puzzle, onChange }: { state: ReturnType<typeof useScramble>; puzzle?: Puzzle; onChange?: () => void }) {
  return <div className="flex flex-col gap-2">
    <label className="t-meta text-quiet flex flex-wrap items-center gap-3">{polish.scramble.source}
      <select className="field" value={state.quick ? "quick" : "state"} onChange={(event) => { onChange?.(); state.setQuick(event.target.value === "quick"); }}>
        <option value="state">{puzzle?.id !== "3x3x3" ? polish.scramble.event : polish.scramble.state}</option>
        <option value="quick">{polish.scramble.quick}</option>
      </select>
    </label>
    {state.failed ? <div role="alert" className="status-line"><p>{polish.scramble.failed}</p><button type="button" className="btn mt-2" onClick={state.retry}>{polish.scramble.retry}</button></div> : null}
  </div>;
}
