import { at } from "../core/arrays.js";
import type { OrientedInPlace, TraceResult } from "../trace/trace.js";

/**
 * Memo representation: how a finished trace is turned into the two-letter items a solver
 * memorises (DECISIONS D-015).
 *
 * Every item is two letters, so each one names a cell of the 24×24 letter-pair grid. A letter
 * that would otherwise be alone (a trailing target, or a piece twisted or flipped in place) is
 * doubled into a self-pair, or, in `chain` mode, first chained with the other lone letters.
 *
 * This layer only reads a `TraceResult`. Tracing never depends on it, and nothing that solves,
 * searches or selects algs may import it (test/memo/boundary.test.ts).
 */

export type SingleLetterRepresentation = "chain" | "selfPair";

export const DEFAULT_SINGLE_LETTER_REPRESENTATION: SingleLetterRepresentation = "selfPair";

export interface MemoOptions {
  readonly singleLetterRepresentation?: SingleLetterRepresentation;
}

/** Where one letter of a memo item came from. */
export type MemoLetterSource =
  | { readonly from: "target"; readonly index: number }
  /** The home letter of a piece twisted or flipped in place (`chain` mode). */
  | { readonly from: "home"; readonly piece: string }
  /** The displayed letter of a piece twisted or flipped in place. */
  | { readonly from: "displayed"; readonly piece: string }
  /** The second letter of a doubled item. */
  | { readonly from: "repeat" };

export type MemoItemKind = "pair" | "loneLetter" | "orientationMarker";

export interface MemoItem {
  readonly letters: readonly [string, string];
  readonly kind: MemoItemKind;
  readonly sources: readonly [MemoLetterSource, MemoLetterSource];
}

export interface MemoView {
  readonly singleLetterRepresentation: SingleLetterRepresentation;
  readonly items: readonly MemoItem[];
  /** Copied from the trace. Never inferred from the items: in `chain` mode a doubled leftover doesn't mean parity. */
  readonly parity: boolean;
}

interface ChainLetter {
  readonly letter: string;
  readonly source: MemoLetterSource;
}

function marker(piece: OrientedInPlace): MemoItem {
  return {
    letters: [piece.letter, piece.letter],
    kind: "orientationMarker",
    sources: [{ from: "displayed", piece: piece.piece }, { from: "repeat" }],
  };
}

function pairUp(chain: readonly ChainLetter[]): MemoItem[] {
  const items: MemoItem[] = [];
  for (let i = 0; i < chain.length; i += 2) {
    const first = at(chain, i);
    const second = chain[i + 1];
    items.push(
      second === undefined
        ? { letters: [first.letter, first.letter], kind: "loneLetter", sources: [first.source, { from: "repeat" }] }
        : { letters: [first.letter, second.letter], kind: "pair", sources: [first.source, second.source] },
    );
  }
  return items;
}

export function memoView(trace: TraceResult, options: MemoOptions = {}): MemoView {
  const mode = options.singleLetterRepresentation ?? DEFAULT_SINGLE_LETTER_REPRESENTATION;
  // The buffer's own twist or flip is implied by the other pieces and never memorised.
  const misoriented = trace.orientedInPlace.filter((o) => !o.isBuffer);
  const targets: ChainLetter[] = trace.targets.map((letter, index) => ({ letter, source: { from: "target", index } }));

  const chain =
    mode === "chain" ? [...targets, ...misoriented.map((o): ChainLetter => ({ letter: o.homeLetter, source: { from: "home", piece: o.piece } }))] : targets;

  return {
    singleLetterRepresentation: mode,
    items: [...pairUp(chain), ...misoriented.map(marker)],
    parity: trace.parity,
  };
}
