"use client";

import { renderPlan, type CubeRenderMode } from "@bld/cube-engine";
import { useEffect, useMemo } from "react";
import { Cube } from "@/components/cube/cube";
import { useSettings } from "@/components/settings/settings-provider";
import { usePuzzle } from "@/components/cube/use-puzzle";

/**
 * The 3D (or net) cube behind a case card, mounted only when the card is opened (§79). The render mode decides what is
 * lit, so a card never chooses which stickers to point at. Play, pause, step, reset and speed come from `Cube`.
 */
export function CardCube({ setup, alg, mode, label, tempo }: { setup: string; alg: string; mode: CubeRenderMode; label: string; tempo: number }) {
  const puzzle = usePuzzle("3x3x3");
  const { request3D } = useSettings();
  useEffect(() => { request3D(); }, [request3D]);
  const highlight = useMemo(() => {
    if (puzzle === undefined) return undefined;
    try { return renderPlan(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(setup), mode).highlight; } catch { return undefined; }
  }, [puzzle, setup, mode]);
  return <Cube setup={setup} alg={alg} controls tempo={tempo} label={label} {...(highlight === undefined || highlight.length === 0 ? {} : { highlight })} />;
}
