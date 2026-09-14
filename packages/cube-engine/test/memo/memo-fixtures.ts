/**
 * Worked examples for the memo layer (DECISIONS D-015), written by hand from its rules.
 *
 * `selfPair`: targets pair as traced; a trailing target is doubled; each non-buffer twisted or
 * flipped piece becomes its displayed letter doubled.
 * `chain`: targets, then each non-buffer misoriented piece's home letter, paired as one chain; a
 * leftover letter is doubled; then each of those pieces' displayed letter doubled.
 * The buffer's own twist or flip never appears.
 *
 * Item kinds are abbreviated: p = pair, l = loneLetter, m = orientationMarker.
 */
import type { TraceFixture } from "../fixtures/trace-fixtures.js";

export interface MemoExpectation {
  readonly memo: string;
  readonly kinds: string;
}

export interface MemoFixture {
  readonly id: string;
  readonly description: string;
  readonly pieceType: "corners" | "edges";
  /** A real-scramble golden trace fixture (by id), or a state constructed from hand-written targets. */
  readonly source: { readonly traceFixture: string } | { readonly constructed: TraceFixture };
  /** For constructed states: the trace the hand-written targets must produce. */
  readonly trace?: { readonly targets: string; readonly orientedInPlace: string; readonly parity: boolean };
  readonly selfPair: MemoExpectation;
  readonly chain: MemoExpectation;
  readonly parity: boolean;
}

export const MEMO_FIXTURES: readonly MemoFixture[] = [
  {
    id: "M-R01",
    description: "D-015 row 1: even targets, DFL (L, home U) and DBR (O, home W) twisted",
    pieceType: "corners",
    source: { traceFixture: "R01" },
    selfPair: { memo: "DA SB PB LL OO", kinds: "p p p m m" },
    chain: { memo: "DA SB PB UW LL OO", kinds: "p p p p m m" },
    parity: false,
  },
  {
    id: "M-R02",
    description: "D-015 row 2: trailing E, DBR (O, home W) twisted, buffer twisted (J, omitted)",
    pieceType: "corners",
    source: { traceFixture: "R02" },
    selfPair: { memo: "XD PN AU EE OO", kinds: "p p p l m" },
    chain: { memo: "XD PN AU EW OO", kinds: "p p p p m" },
    parity: true,
  },
  {
    id: "M-row3",
    description: "D-015 row 3: trailing J with DFR twisted clockwise (K, home V); buffer UBL, because J is on UFR",
    pieceType: "corners",
    source: {
      constructed: {
        id: "M-row3",
        description: "",
        categories: [],
        puzzle: "3x3x3",
        scheme: "speffz",
        corners: {
          buffer: "UBL",
          targets: "J",
          // The buffer's counterclockwise twist balances the twist sum, so the state is reachable.
          twists: [
            { piece: "DFR", turns: 1 },
            { piece: "UBL", turns: -1 },
          ],
          expected: { cycleBreaks: [], parity: true },
        },
        edges: { buffer: "UF", targets: "A", expected: { cycleBreaks: [], parity: true } },
      },
    },
    trace: { targets: "J", orientedInPlace: "DFR K clockwise, UBL R counterclockwise buffer", parity: true },
    selfPair: { memo: "JJ KK", kinds: "l m" },
    chain: { memo: "JV KK", kinds: "p m" },
    parity: true,
  },
  {
    id: "M-fake-leftover",
    description: "D-015 prose: DA SB with DFR twisted; chain mode leaves a doubled V with no parity",
    pieceType: "corners",
    source: {
      constructed: {
        id: "M-fake-leftover",
        description: "",
        categories: [],
        puzzle: "3x3x3",
        scheme: "speffz",
        corners: {
          buffer: "UFR",
          targets: "D A S B",
          twists: [
            { piece: "DFR", turns: 1 },
            { piece: "UFR", turns: -1 },
          ],
          expected: { cycleBreaks: [], parity: false },
        },
      },
    },
    trace: { targets: "D A S B", orientedInPlace: "DFR K clockwise, UFR J counterclockwise buffer", parity: false },
    selfPair: { memo: "DA SB KK", kinds: "p p m" },
    chain: { memo: "DA SB VV KK", kinds: "p p l m" },
    parity: false,
  },
  {
    id: "M-R01-edges",
    description: "Edges: 12 targets, BL flipped (H, home R), buffer UF flipped (I, omitted); chain leaves RR with no parity",
    pieceType: "edges",
    source: { traceFixture: "R01" },
    selfPair: { memo: "DB AW VQ GT GJ UP HH", kinds: "p p p p p p m" },
    chain: { memo: "DB AW VQ GT GJ UP RR HH", kinds: "p p p p p p l m" },
    parity: false,
  },
];
