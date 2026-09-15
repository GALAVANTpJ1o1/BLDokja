"use client";

import { compileLettering, pieceType, speffzScheme, stickerName, type Lettering, type Puzzle, type Scheme } from "@bld/cube-engine";
import { useMemo } from "react";
import { usePuzzle } from "@/components/cube/use-puzzle";
import type { FaceName } from "@/design/palette";

/**
 * The reader's lettering scheme and buffers, which every lesson example and trainer reads from
 * (BRIEF §7.6; your 2026-09-15 answer: examples use the reader's settings, defaulting to Gate B).
 * Custom schemes and buffers arrive in Phase 5; until then this is Speffz with the D-022 buffers, and
 * nothing downstream assumes either.
 */
export const GATE_B_BUFFERS = {
  op: { corners: "UBL", edges: "UR" },
  m2: { corners: "UBL", edges: "DF" },
  threeStyle: { corners: "UFR", edges: "UF" },
} as const;

export interface Reader {
  readonly puzzle: Puzzle;
  readonly scheme: Scheme;
  readonly buffers: typeof GATE_B_BUFFERS;
  /** The letter of a corner or edge sticker by name ("UBL" → "A" in Speffz), or undefined for a centre. */
  letterOf(sticker: string): string | undefined;
  /** The sticker a letter names within a piece type. */
  stickerOf(pieceType: "corners" | "edges", letter: string): string | undefined;
  faceOf(sticker: string): FaceName;
  pieceTypeOf(sticker: string): "corners" | "edges" | undefined;
  /** The name of the sticker slot at a geometry index. */
  nameOf(index: number): string;
}

export function readerFor(puzzle: Puzzle): Reader {
  const scheme = speffzScheme(puzzle);
  const letterings: Record<"corners" | "edges", Lettering> = {
    corners: unwrap(compileLettering(puzzle, scheme, "corners")),
    edges: unwrap(compileLettering(puzzle, scheme, "edges")),
  };
  const byName = new Map<string, { type: "corners" | "edges"; sticker: (typeof letterings.corners.pieceType.stickers)[number] }>();
  for (const type of ["corners", "edges"] as const) {
    for (const sticker of pieceType(puzzle, type).stickers) byName.set(sticker.name, { type, sticker });
  }
  return {
    puzzle,
    scheme,
    buffers: GATE_B_BUFFERS,
    letterOf: (name) => {
      const found = byName.get(name);
      return found === undefined ? undefined : letterings[found.type].letterOf(found.sticker);
    },
    stickerOf: (type, letter) => letterings[type].stickerOf(letter)?.name,
    faceOf: (name) => byName.get(name)?.sticker.face ?? "U",
    pieceTypeOf: (name) => byName.get(name)?.type,
    nameOf: (index) => stickerName(puzzle.geometry, index),
  };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`Speffz failed to compile: ${JSON.stringify(result.error)}`);
  return result.value;
}

export function useReader(): Reader | undefined {
  const puzzle = usePuzzle();
  return useMemo(() => (puzzle === undefined ? undefined : readerFor(puzzle)), [puzzle]);
}
