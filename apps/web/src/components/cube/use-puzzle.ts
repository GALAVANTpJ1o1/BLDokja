"use client";

import { loadPuzzle, type Puzzle, type PuzzleId } from "@bld/cube-engine";
import { useEffect, useState } from "react";

/** The engine's puzzle model, loaded once per page (loadPuzzle caches it). `null` loads nothing. */
export function usePuzzle(id: PuzzleId | null = "3x3x3"): Puzzle | undefined {
  const [puzzle, setPuzzle] = useState<Puzzle | undefined>(undefined);
  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    void loadPuzzle(id).then((p) => {
      if (!cancelled) setPuzzle(p);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return puzzle;
}
