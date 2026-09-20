"use client";

import { renderPlan, type CubeRenderMode } from "@bld/cube-engine";
import { useEffect, useMemo } from "react";
import { Cube } from "@/components/cube/cube";
import { useSettings } from "@/components/settings/settings-provider";
import { usePuzzle } from "@/components/cube/use-puzzle";

/**
 * The cube of a recognition stage: the real state (moves from solved), lit by the stage's render mode, with the
 * algorithm played on it when there is one. Loaded on demand, so the quiet timed screen is a light SVG.
 */
export function StageCube({ setup, alg = "", mode, label, autoplay = false, controls = false }: { setup: string; alg?: string; mode: CubeRenderMode; label: string; autoplay?: boolean; controls?: boolean }) {
  const puzzle = usePuzzle("3x3x3");
  const { request3D } = useSettings();
  useEffect(() => { request3D(); }, [request3D]);
  const highlight = useMemo(() => {
    if (puzzle === undefined) return undefined;
    try { return renderPlan(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(setup), mode).highlight; } catch { return undefined; }
  }, [puzzle, setup, mode]);
  return <Cube setup={setup} alg={alg} label={label} autoplay={autoplay} controls={controls} {...(highlight === undefined || highlight.length === 0 ? {} : { highlight })} />;
}
