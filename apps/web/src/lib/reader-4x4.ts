"use client";

import { pieceType, speffzScheme, type Frame, type Puzzle, type Scheme } from "@bld/cube-engine";
import { useMemo } from "react";
import { usePuzzle } from "@/components/cube/use-puzzle";
import type { FaceName } from "@/design/palette";

/**
 * Lettering and buffers for the 4BLD track (BRIEF §6). Speffz on 4x4 letters wings and x-centres too, one
 * sticker per piece, and that is what the datasets and the trainers use. Custom 4x4 schemes aren't offered
 * yet (the scheme editor is 3x3 only), so this reader is deliberately small.
 *
 * Buffers are the ones the committed datasets are for (D-038): x-centres Ubr, wings the DFr wing — named
 * by its lettered sticker FDr, because only one of a wing's two stickers can stand for the piece — and
 * corners UFR, the 3-style buffer, whose comms move nothing but corners on a 4x4 as well.
 */
export const FOUR_BLD_BUFFERS = { xcenters: "Ubr", wings: "FDr", corners: "UFR" } as const;

export type FourBldPieces = keyof typeof FOUR_BLD_BUFFERS;
export const FOUR_BLD_PIECES: readonly FourBldPieces[] = ["xcenters", "wings", "corners"];

export interface Reader4x4 {
  readonly puzzle: Puzzle;
  readonly scheme: Scheme;
  readonly buffers: typeof FOUR_BLD_BUFFERS;
  /** How the cube is held while memorising. The trainers use the scramble as it stands (D-032). */
  readonly frame: Frame;
  letterOf(sticker: string): string | undefined;
  /** The sticker a letter names within a piece type, if any. */
  stickerOf(pieces: FourBldPieces, letter: string): string | undefined;
  faceOf(sticker: string): FaceName;
  nameOf(index: number): string;
}

export function useReader4x4(): Reader4x4 | undefined {
  const puzzle = usePuzzle("4x4x4");
  return useMemo(() => (puzzle === undefined ? undefined : readerFor4x4(puzzle)), [puzzle]);
}

export function readerFor4x4(puzzle: Puzzle): Reader4x4 {
  const scheme = speffzScheme(puzzle);
  const letters = new Map<string, string>();
  const byLetter = new Map<FourBldPieces, Map<string, string>>();
  for (const pieces of FOUR_BLD_PIECES) {
    const entries = Object.entries(scheme.letters[pieces] ?? {});
    byLetter.set(pieces, new Map(entries.map(([sticker, letter]) => [letter, sticker])));
    for (const [sticker, letter] of entries) letters.set(sticker, letter);
  }
  const names = new Map(puzzle.geometry.stickers.map((s) => [s.index, nameOfSticker(puzzle, s.index)]));
  return {
    puzzle,
    scheme,
    buffers: FOUR_BLD_BUFFERS,
    frame: { kind: "asIs" },
    letterOf: (sticker) => letters.get(sticker),
    stickerOf: (pieces, letter) => byLetter.get(pieces)?.get(letter.toLocaleUpperCase()),
    faceOf: (sticker) => puzzle.geometry.stickers.find((s) => names.get(s.index) === sticker)?.face ?? "U",
    nameOf: (index) => names.get(index) ?? "",
  };
}

function nameOfSticker(puzzle: Puzzle, index: number): string {
  for (const pieces of FOUR_BLD_PIECES) {
    const found = pieceType(puzzle, pieces).stickers.find((s) => s.index === index);
    if (found !== undefined) return found.name;
  }
  return "";
}

/**
 * Every sticker of the pieces named, for lighting on the cube: a wing's two stickers and a corner's three
 * share their letters ("UBl" and "BUl"), and case keeps pieces apart ("UBl" is a wing, "Ubl" an x-centre).
 */
export function stickersOfPieces(reader: Reader4x4, names: readonly string[]): string[] {
  const key = (name: string) => Array.from(name).sort().join("");
  const wanted = new Set(names.map(key));
  return reader.puzzle.geometry.stickers.map((s) => reader.nameOf(s.index)).filter((name) => name !== "" && wanted.has(key(name)));
}
