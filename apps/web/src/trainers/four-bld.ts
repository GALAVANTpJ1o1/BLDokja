"use client";

import {
  drillScramble,
  expandNodes,
  formatMoves,
  interchangeableChoices,
  invertMoves,
  parseAlg,
  pieceType,
  trace,
  type Puzzle,
  type SwapDataset,
  type TraceResult,
} from "@bld/cube-engine";
import type { FourBldPieces, Reader4x4 } from "@/lib/reader-4x4";

/**
 * The 4BLD trainers (BRIEF §6, §7): tracing on a 4x4, and the two swap methods' case drills.
 *
 * X-centres are the reason this isn't the 3BLD trainer with a bigger cube. Four x-centres of a colour are
 * the same piece, so a trace has more than one right answer at most steps: the buffer's piece may go to any
 * slot of its colour that still needs it. `centreSession` walks that by hand, accepting any of them and
 * following the answer the learner gave, rather than marking a correct letter wrong for not being the one
 * the engine would have picked.
 */

export const FOUR_BLD_TRAINER = "4bld";

export interface Shot {
  /** Stable id for history: `r2:UBl`, `u2:Lub`. */
  readonly id: string;
  readonly target: string;
  readonly letter: string;
  /** The setup, empty for the swap slot itself. */
  readonly setup: string;
  /** What to do: the setup, the swap, the undo — or a special alg on its own. */
  readonly notation: string;
  readonly moves: string;
  /** The record to use instead when this target is the second of a pair (the odd/even rule). */
  readonly shootAs?: string;
  /** Pieces to light on the cube: the buffer and the target. */
  readonly lit: readonly string[];
  readonly special: boolean;
}

/** One drill case per record in a swap dataset, in the dataset's order. */
export function shotCases(dataset: SwapDataset, reader: Reader4x4, pieces: FourBldPieces): Shot[] {
  const odd = new Map(dataset.oddStepRule.map((r) => [r.target, r.shootAs]));
  // Letters are looked up within the piece type: a wing and an x-centre can share a sticker name's letters.
  const letters = reader.scheme.letters[pieces] ?? {};
  return dataset.records.map((record) => {
    const main = record.algs[0];
    const setup = record.kind === "target" ? record.setup : "";
    const shootAs = odd.get(record.target);
    return {
      id: `${dataset.method}:${record.target}`,
      target: record.target,
      letter: letters[record.target] ?? "?",
      setup,
      notation: main?.alg ?? "",
      moves: main?.moves ?? "",
      ...(shootAs === undefined ? {} : { shootAs }),
      lit: [dataset.buffer, record.target],
      special: record.kind === "special",
    };
  });
}

/** The state a shot is shown from: the case, set up so that performing the alg solves it. */
export function shotSetup(puzzle: Puzzle, shot: Shot): string | undefined {
  const scramble = drillScramble(puzzle, shot.moves);
  return scramble.ok ? scramble.value.scramble : undefined;
}

/** The moves of an alg, cancelled, for the cube to animate. */
export function movesOf(puzzle: Puzzle, alg: string): string {
  const parsed = parseAlg(puzzle.id, alg);
  return parsed.ok ? formatMoves(expandNodes(parsed.value.nodes)) : "";
}

export function undoOf(puzzle: Puzzle, setup: string): string {
  if (setup === "") return "";
  const parsed = parseAlg(puzzle.id, setup);
  return parsed.ok ? formatMoves(invertMoves(expandNodes(parsed.value.nodes))) : "";
}

export interface TraceStep {
  /** Stickers any of which is a right answer now. One, except for x-centres. */
  readonly accepted: readonly string[];
  readonly letters: readonly string[];
  /** Whether this step starts a new cycle (the buffer's own piece was home). */
  readonly isBreak: boolean;
}

export interface CentreSession {
  /** The steps so far, and what would be accepted next; `undefined` when the type is done. */
  next(): TraceStep | undefined;
  /** Take an answer. Returns the accepted sticker, or undefined if the letter isn't one of them. */
  answer(letter: string): string | undefined;
  readonly done: boolean;
  readonly count: number;
}

/**
 * A tracing session for x-centres, walked one answer at a time. The colours come from the scrambled
 * pattern; each answer swaps the chosen slot with the buffer, exactly as shooting it would.
 */
export function centreSession(reader: Reader4x4, scramble: string): CentreSession | undefined {
  const { puzzle } = reader;
  const type = pieceType(puzzle, "xcenters");
  const orbit = puzzle.stickerMap.orbits[type.orbitIndex];
  const pattern = puzzle.kpuzzle.defaultPattern().applyAlg(scramble);
  const data = pattern.patternData[type.orbit];
  if (orbit === undefined || data === undefined) return undefined;
  const homes = orbit.defaultPieces;
  const colours = [...data.pieces].map((value) => homes[value] ?? value);
  const buffer = type.pieceByName(reader.buffers.xcenters)?.position ?? -1;
  const stickerOf = (position: number) => type.pieces[position]?.stickers[0]?.name ?? "";
  let count = 0;

  const step = (): TraceStep | undefined => {
    const choices = interchangeableChoices(type, buffer, colours, homes);
    if (choices.positions.length === 0) return undefined;
    const accepted = choices.positions.map(stickerOf);
    return { accepted, letters: accepted.map((s) => reader.letterOf(s) ?? "?"), isBreak: choices.kind === "break" };
  };

  return {
    next: step,
    answer(letter) {
      const current = step();
      if (current === undefined) return undefined;
      const index = current.letters.findIndex((l) => l.toLocaleUpperCase() === letter.trim().toLocaleUpperCase());
      const sticker = current.accepted[index];
      if (sticker === undefined) return undefined;
      const position = type.pieceByName(sticker)?.position ?? -1;
      const held = colours[buffer];
      colours[buffer] = colours[position] ?? 0;
      colours[position] = held ?? 0;
      count++;
      return sticker;
    },
    get done() {
      return step() === undefined;
    },
    get count() {
      return count;
    },
  };
}

/** Wings and corners trace as they do on a 3x3: one right answer per step. */
export function traceOf(reader: Reader4x4, scramble: string, pieces: Exclude<FourBldPieces, "xcenters">): TraceResult | undefined {
  const result = trace(reader.puzzle, { alg: scramble }, { pieceType: pieces, buffer: reader.buffers[pieces], scheme: reader.scheme, frame: reader.frame });
  return result.ok ? result.value : undefined;
}
