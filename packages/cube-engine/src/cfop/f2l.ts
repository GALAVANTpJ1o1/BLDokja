import { KPattern, type KPatternData } from "cubing/kpuzzle";
import { Alg } from "cubing/alg";
import { permutationParity } from "../core/arrays.js";
import { moveTable } from "../core/move-table.js";
import { faceletsOf, type Puzzle } from "../core/puzzle.js";
import type { Rng } from "../random/prng.js";
import { F2LSetSchema, type F2LCuratedCase, type F2LSet } from "./schema.js";
export { F2LSetSchema, type F2LCuratedCase, type F2LSet };
import { slotViews } from "../display/stickering.js";

/**
 * F2L cases, enumerated from first principles (polish brief §14-28, §57-58; DECISIONS D-081). A case is the front-right
 * slot's corner (DFR) and edge (FR) somewhere legal, with the cross and the other three slots solved:
 *
 *   - corner in the top layer (4 places x 3 twists) or in its slot (3 twists);
 *   - edge in the top layer (4 places x 2 flips) or in its slot (2 flips);
 *   - solved is not a case.
 *
 * Turning the top layer (an AUF) does not change the case, only where the pieces are, so cases are the
 * classes of these placements under the four U turns: 24 (both on top) + 6 (corner on top, edge in slot) + 6 (corner
 * in slot, edge on top) + 5 (both in the slot) = 41. Nothing is copied from a reference sheet and every state is built
 * by a validated constructor: displaced pieces swap into the vacated positions and the twist and parity
 * conditions are repaired with last-layer pieces only.
 */

const CORNER_HOME = 4; // DFR in the kpuzzle corner order
const EDGE_HOME = 8; // FR in the kpuzzle edge order
const CORNER_TOP = [0, 1, 2, 3] as const;
const EDGE_TOP = [0, 1, 2, 3] as const;

export interface F2LPlacement {
  /** 0-3: the four top-layer corner places in engine order; 4: the front-right slot. */
  readonly cornerPlace: number;
  readonly cornerTwist: 0 | 1 | 2;
  /** 0-3: the four top-layer edge places; 8: the front-right slot. */
  readonly edgePlace: number;
  readonly edgeFlip: 0 | 1;
}

/** Whether the pair is solved and in place. */
export const isSolvedPlacement = (p: F2LPlacement) => p.cornerPlace === CORNER_HOME && p.cornerTwist === 0 && p.edgePlace === EDGE_HOME && p.edgeFlip === 0;

/** Build the cube state for a placement. Cross and the other three slots solved; last-layer pieces repair parity and twist. */
export function f2lPattern(puzzle: Puzzle, placement: F2LPlacement): KPattern {
  const base = puzzle.kpuzzle.defaultPattern().patternData;
  const corners = base.CORNERS; const edges = base.EDGES;
  if (corners === undefined || edges === undefined) throw new Error("no CORNERS/EDGES orbit");
  const cPieces = [...corners.pieces]; const cOri = corners.orientation.map(() => 0);
  const ePieces = [...edges.pieces]; const eOri = edges.orientation.map(() => 0);
  // Corner: piece 4 goes to its place; whatever was there goes to the slot.
  if (placement.cornerPlace !== CORNER_HOME) { cPieces[placement.cornerPlace] = CORNER_HOME; cPieces[CORNER_HOME] = placement.cornerPlace; }
  cOri[placement.cornerPlace] = placement.cornerTwist;
  if (placement.edgePlace !== EDGE_HOME) { ePieces[placement.edgePlace] = EDGE_HOME; ePieces[EDGE_HOME] = placement.edgePlace; }
  eOri[placement.edgePlace] = placement.edgeFlip;
  // Repair: a lone corner swap or edge swap makes the parities differ; swap two last-layer edges of the other kind.
  const cornerSwapped = placement.cornerPlace !== CORNER_HOME; const edgeSwapped = placement.edgePlace !== EDGE_HOME;
  if (cornerSwapped !== edgeSwapped) {
    if (cornerSwapped) { const a = ePieces[0] ?? 0; ePieces[0] = ePieces[1] ?? 1; ePieces[1] = a; } else { const a = cPieces[0] ?? 0; cPieces[0] = cPieces[1] ?? 1; cPieces[1] = a; }
  }
  // Repair twist: corner twists sum to 0 mod 3, edge flips to 0 mod 2, taken up by a last-layer piece that is not the pair.
  const cornerSum = cOri.reduce((a, b) => a + b, 0) % 3;
  if (cornerSum !== 0) { const spare = CORNER_TOP.find((i) => i !== placement.cornerPlace && cPieces[i] !== CORNER_HOME); if (spare === undefined) throw new Error("no spare corner"); cOri[spare] = (3 - cornerSum) % 3; }
  const edgeSum = eOri.reduce((a, b) => a + b, 0) % 2;
  if (edgeSum !== 0) { const spare = EDGE_TOP.find((i) => i !== placement.edgePlace && ePieces[i] !== EDGE_HOME); if (spare === undefined) throw new Error("no spare edge"); eOri[spare] = 1; }
  if (permutationParity(cPieces) !== permutationParity(ePieces)) throw new Error("f2lPattern produced a parity mismatch");
  const data: KPatternData = { ...base, CORNERS: { pieces: cPieces, orientation: cOri }, EDGES: { pieces: ePieces, orientation: eOri } };
  return new KPattern(puzzle.kpuzzle, data);
}

/** Where the pair's pieces are in a state (or undefined if either has left the top layer and its slot). */
export function placementOf(pattern: KPattern): F2LPlacement | undefined {
  const c = pattern.patternData.CORNERS; const e = pattern.patternData.EDGES;
  if (c === undefined || e === undefined) return undefined;
  const cornerPlace = c.pieces.indexOf(CORNER_HOME); const edgePlace = e.pieces.indexOf(EDGE_HOME);
  if (cornerPlace < 0 || edgePlace < 0) return undefined;
  if (cornerPlace > 4 || (cornerPlace >= 4 && cornerPlace !== CORNER_HOME) || (edgePlace > 3 && edgePlace !== EDGE_HOME)) return undefined;
  return { cornerPlace, cornerTwist: (c.orientation[cornerPlace] ?? 0) as 0 | 1 | 2, edgePlace, edgeFlip: (e.orientation[edgePlace] ?? 0) as 0 | 1 };
}

function keyOf(p: F2LPlacement): string {
  return `${p.cornerPlace}.${p.cornerTwist}.${p.edgePlace}.${p.edgeFlip}`;
}

/** The placement after `count` turns of U. Read from the engine, not assumed: which way each top place moves is an engine fact. */
export function turnedPlacement(puzzle: Puzzle, placement: F2LPlacement, count: number): F2LPlacement {
  const turned = f2lPattern(puzzle, placement).applyAlg(count === 0 ? "" : count === 1 ? "U" : count === 2 ? "U2" : "U'");
  const result = placementOf(turned);
  if (result === undefined) throw new Error("a U turn moved the pair out of the top layer and its slot");
  return result;
}

export interface F2LCase {
  readonly index: number;
  /** The smallest placement of the class, the one shown as the case. */
  readonly placement: F2LPlacement;
  /** Every placement (with each U turn) that is this case. */
  readonly members: readonly F2LPlacement[];
  readonly family: "both-top" | "corner-top-edge-slot" | "corner-slot-edge-top" | "both-slot";
}

/** Every placement a pair can be in with cross and the other slots solved, solved excluded. */
export function allPlacements(): F2LPlacement[] {
  const out: F2LPlacement[] = [];
  for (const cornerPlace of [...CORNER_TOP, CORNER_HOME]) for (const cornerTwist of [0, 1, 2] as const)
    for (const edgePlace of [...EDGE_TOP, EDGE_HOME]) for (const edgeFlip of [0, 1] as const) {
      const placement = { cornerPlace, cornerTwist, edgePlace, edgeFlip };
      if (!isSolvedPlacement(placement)) out.push(placement);
    }
  return out;
}

const cache = new WeakMap<Puzzle, readonly F2LCase[]>();

/** The 41 cases, in a fixed teaching order: both in the slot, then one in the slot, then both on top. */
export function f2lCases(puzzle: Puzzle): readonly F2LCase[] {
  const cached = cache.get(puzzle);
  if (cached !== undefined) return cached;
  const classes = new Map<string, F2LPlacement[]>();
  for (const placement of allPlacements()) {
    const orbit = [0, 1, 2, 3].map((k) => turnedPlacement(puzzle, placement, k));
    const key = orbit.map(keyOf).sort()[0] ?? keyOf(placement);
    const members = classes.get(key) ?? [];
    if (!members.some((m) => keyOf(m) === keyOf(placement))) members.push(placement);
    classes.set(key, members);
  }
  const familyOf = (p: F2LPlacement): F2LCase["family"] => (p.cornerPlace === CORNER_HOME ? (p.edgePlace === EDGE_HOME ? "both-slot" : "corner-slot-edge-top") : p.edgePlace === EDGE_HOME ? "corner-top-edge-slot" : "both-top");
  const order: Record<F2LCase["family"], number> = { "both-slot": 0, "corner-top-edge-slot": 1, "corner-slot-edge-top": 2, "both-top": 3 };
  const list = [...classes.entries()].map(([key, members]) => ({ key, members, placement: members.slice().sort((a, b) => keyOf(a).localeCompare(keyOf(b)))[0] ?? members[0] as F2LPlacement }));
  list.sort((a, b) => order[familyOf(a.placement)] - order[familyOf(b.placement)] || a.placement.cornerTwist - b.placement.cornerTwist || a.placement.edgeFlip - b.placement.edgeFlip || a.key.localeCompare(b.key));
  const cases = list.map((entry, i): F2LCase => ({ index: i + 1, placement: entry.placement, members: entry.members, family: familyOf(entry.placement) }));
  cache.set(puzzle, cases);
  return cases;
}

/** Which of the 41 cases a state is (undefined when it is not a single-pair state, or is solved). */
export function classifyF2L(puzzle: Puzzle, pattern: KPattern): F2LCase | undefined {
  const placement = placementOf(pattern);
  if (placement === undefined || isSolvedPlacement(placement)) return undefined;
  if (!otherPiecesSolved(pattern)) return undefined;
  const key = keyOf(placement);
  return f2lCases(puzzle).find((c) => c.members.some((m) => keyOf(m) === key));
}

/** The cross and the three other slots are home: every piece outside the last layer and this slot, and the pair's own place. */
export function otherPiecesSolved(pattern: KPattern): boolean {
  const c = pattern.patternData.CORNERS; const e = pattern.patternData.EDGES;
  if (c === undefined || e === undefined) return false;
  const cornersOk = [5, 6, 7].every((i) => c.pieces[i] === i && c.orientation[i] === 0);
  const edgesOk = [4, 5, 6, 7, 9, 10, 11].every((i) => e.pieces[i] === i && e.orientation[i] === 0);
  return cornersOk && edgesOk;
}

/** The whole first two layers are solved: the cross, all four pairs, and the centres in place. */
export function f2lSolved(pattern: KPattern): boolean {
  const c = pattern.patternData.CORNERS; const e = pattern.patternData.EDGES;
  if (c === undefined || e === undefined) return false;
  return [4, 5, 6, 7].every((i) => c.pieces[i] === i && c.orientation[i] === 0) && [4, 5, 6, 7, 8, 9, 10, 11].every((i) => e.pieces[i] === i && e.orientation[i] === 0);
}

/** How many of the four pairs are unsolved (a pair is solved when its corner and edge are both home and unturned). */
export function unsolvedPairCount(pattern: KPattern): number {
  const c = pattern.patternData.CORNERS; const e = pattern.patternData.EDGES;
  if (c === undefined || e === undefined) return 4;
  const slots = [[4, 8], [5, 9], [7, 10], [6, 11]] as const; // DFR/FR, DFL/FL, DBR/BR, DBL/BL
  return slots.filter(([ci, ei]) => !(c.pieces[ci] === ci && c.orientation[ci] === 0 && e.pieces[ei] === ei && e.orientation[ei] === 0)).length;
}

/** The cross is intact: the four bottom edges are home and unturned. */
export function crossSolved(pattern: KPattern): boolean {
  const e = pattern.patternData.EDGES;
  return e !== undefined && [4, 5, 6, 7].every((i) => e.pieces[i] === i && e.orientation[i] === 0);
}

/* ------------------------------------------------------------------ practice states */

export const F2L_LEVELS = [1, 2, 3, 4] as const;
export type F2LLevel = (typeof F2L_LEVELS)[number];

export interface F2LPractice {
  readonly level: F2LLevel;
  /** A legal move sequence from solved that reaches the state (states are derived from moves, never assembled sticker by sticker). */
  readonly setup: string;
  readonly state: KPattern;
  /** Level 1: which of the 41 cases the state is. */
  readonly caseIndex: number | undefined;
  /** An efficient way to solve it, for "show solution" and for the move count reference. */
  readonly reference: string;
  readonly unsolved: number;
}

/** A reference solution for a case, in the front-right slot. */
export interface F2LSolution { readonly index: number; readonly alg: string }

const AUF = ["", "U", "U2", "U'"] as const;
const AUF_BACK = ["", "U'", "U2", "U"] as const;
const inverse = (alg: string) => new Alg(alg).invert().toString();
/** Whole-cube turns that carry the front-right slot to each of the four slots. */
const SLOT_TURNS = ["", "y", "y2", "y'"] as const;
const conjugate = (turn: string, alg: string) => (turn === "" ? alg : `${turn} ${alg} ${inverse(turn)}`);

/** Whether every requested slot still needs work and the cross is home. */
function acceptable(pattern: KPattern, minUnsolved: number): boolean {
  return crossSolved(pattern) && unsolvedPairCount(pattern) >= minUnsolved;
}

/**
 * A practice state for a level, built from legal move sequences (§58):
 *  - level 1: one of the 41 cases (uniform, or from `only`), made by running its reference solution backwards, then a random AUF;
 *  - levels 2 and 3: the same, for two or three different slots one after another, so the pairs really are unsolved together;
 *  - level 4: all four slots, the same way, so a reference solution exists for it as well.
 * Every result is checked (cross home, enough pairs unsolved) before it is returned.
 */
export function generateF2LPractice(puzzle: Puzzle, rng: Rng, level: F2LLevel, solutions: readonly F2LSolution[], only?: readonly number[]): F2LPractice {
  const pool = solutions.filter((s) => only === undefined || only.includes(s.index));
  const draw = () => { const s = pool[rng.int(pool.length)] ?? solutions[0]; if (s === undefined) throw new Error("no F2L solutions supplied"); return s; };
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let setup: string; let caseIndex: number | undefined; let reference: string;
    if (level === 1) {
      const chosen = draw(); const a = rng.int(4);
      setup = [inverse(chosen.alg), AUF[a] ?? ""].filter((p) => p !== "").join(" ");
      reference = [AUF_BACK[a] ?? "", chosen.alg].filter((p) => p !== "").join(" ");
      caseIndex = chosen.index;
    } else {
      const slots = shuffle(rng, [0, 1, 2, 3]).slice(0, level);
      const steps = slots.map((slot) => { const chosen = draw(); const turn = SLOT_TURNS[slot] ?? ""; return { alg: conjugate(turn, chosen.alg), a: rng.int(4) }; });
      setup = steps.map((step) => [inverse(step.alg), AUF[step.a] ?? ""].filter((p) => p !== "").join(" ")).join(" ");
      reference = steps.slice().reverse().map((step) => [AUF_BACK[step.a] ?? "", step.alg].filter((p) => p !== "").join(" ")).join(" ");
    }
    const state = puzzle.kpuzzle.defaultPattern().applyAlg(setup);
    const wanted = level === 1 ? 1 : level;
    if (!acceptable(state, wanted)) continue;
    if (level === 1 && classifyF2L(puzzle, state)?.index !== caseIndex) continue;
    return { level, setup, state, caseIndex, reference, unsolved: unsolvedPairCount(state) };
  }
  throw new Error(`could not build an F2L practice state for level ${level}`);
}

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) { const j = rng.int(i + 1); const a = out[i] as T; out[i] = out[j] as T; out[j] = a; }
  return out;
}

/* ------------------------------------------------------------------ reference solutions */

/**
 * Reference solution search for one case (used to build the curated F2L set and the exercise solutions). Shortest
 * sequence in {R, U} first, then in {R, U, F}, that leaves the cross and all four pairs solved, ranked by a
 * written-down ergonomic rule among the shortest: fewer F turns, fewer half turns, more R U R' style triggers.
 * A search, not a curated source: the data records it as such (`source` on each entry).
 */
export function searchF2LSolutions(puzzle: Puzzle, start: KPattern, families: readonly string[], maxDepth: number, limit: number): string[][] {
  const table = moveTable(puzzle, families);
  const startFacelets = Uint8Array.from(faceletsOf(puzzle, start));
  const solvedSlots = solvedStickerSlots(puzzle);
  const isGoal = (s: Uint8Array) => solvedSlots.every((slot) => s[slot] === slot);
  const found: string[][] = [];
  const buffers = Array.from({ length: maxDepth + 1 }, () => new Uint8Array(startFacelets.length));
  const path: number[] = [];
  const apply = (from: Uint8Array, into: Uint8Array, perm: Uint8Array) => { for (let f = 0; f < perm.length; f += 1) into[perm[f] ?? 0] = from[f] ?? 0; };
  const dfs = (depth: number, limitDepth: number, lastFamily: string): void => {
    if (found.length >= limit) return;
    const current = buffers[depth];
    if (current === undefined) return;
    if (depth === limitDepth) { if (isGoal(current)) found.push(path.map((i) => table.moves[i]?.name ?? "")); return; }
    for (const move of table.moves) {
      if (move.family === lastFamily) continue;
      const nextBuffer = buffers[depth + 1];
      if (nextBuffer === undefined) return;
      apply(current, nextBuffer, move.perm);
      path[depth] = move.index;
      dfs(depth + 1, limitDepth, move.family);
      if (found.length >= limit) return;
    }
  };
  buffers[0]?.set(startFacelets);
  for (let d = 1; d <= maxDepth && found.length === 0; d += 1) dfs(0, d, "");
  return found;
}

/** Sticker slots of every piece in the first two layers (and the centres): the goal of F2L. */
export function solvedStickerSlots(puzzle: Puzzle): number[] {
  const solved = puzzle.kpuzzle.defaultPattern();
  const views = slotViews(puzzle, solved);
  const middle = new Set(["FR", "FL", "BR", "BL"]);
  const slots: number[] = [];
  views.forEach((v, index) => { if (v.piece.includes("D") || middle.has(v.piece) || v.slot.length === 1) slots.push(index); });
  return slots;
}

/** Ergonomic cost of a candidate (lower is better): the written rule the reference search ranks by. */
export function ergonomicCost(moves: readonly string[]): number {
  let cost = 0;
  for (const move of moves) {
    const face = move[0] ?? "";
    const half = move.endsWith("2");
    cost += face === "F" ? (half ? 2 : 1.5) : half ? 1.25 : 1;
  }
  const text = moves.join(" ");
  for (const trigger of ["R U R'", "R' U' R", "R U' R'", "R' U R", "F' U' F", "F U F'", "F U' F'", "F' U F"]) {
    let index = text.indexOf(trigger);
    while (index >= 0) { cost -= 0.4; index = text.indexOf(trigger, index + 1); }
  }
  return cost;
}

/** Mirror an algorithm left-to-right (R and L swap, and every turn reverses direction), for the same case in the front-left slot. */
export function mirrorAlg(alg: string): string {
  const swap: Readonly<Record<string, string>> = { R: "L", L: "R", r: "l", l: "r" };
  return alg.trim().split(/\s+/).filter((token) => token !== "").map((token) => {
    const match = /^([A-Za-z]+)(2?)('?)$/.exec(token);
    if (match === null) throw new Error(`mirrorAlg: cannot read "${token}"`);
    const family = match[1] ?? ""; const half = match[2] ?? ""; const prime = match[3] ?? "";
    const face = swap[family] ?? family;
    return half === "2" ? `${face}2` : prime === "'" ? face : `${face}'`;
  }).join(" ");
}


/** Verify the set against the engine: 41 distinct enumerated cases and every reference solution solves its case. */
export function verifyF2LSet(puzzle: Puzzle, set: F2LSet): string[] {
  const problems: string[] = [];
  const enumerated = f2lCases(puzzle);
  set.cases.forEach((kase, i) => {
    const expected = enumerated[i];
    if (expected === undefined || kase.number !== expected.index) { problems.push(`${kase.id}: number does not follow the enumeration order`); return; }
    if (keyOf(kase.placement) !== keyOf(expected.placement)) problems.push(`${kase.id}: placement differs from the enumerated case`);
    if (kase.family !== expected.family) problems.push(`${kase.id}: family differs`);
    const start = f2lPattern(puzzle, kase.placement);
    if (!otherPiecesSolved(start)) problems.push(`${kase.id}: the case disturbs other pieces`);
    let end: KPattern;
    try { end = start.applyAlg(kase.algs["2H"].alg); } catch { problems.push(`${kase.id}: cannot apply "${kase.algs["2H"].alg}"`); return; }
    if (!f2lSolved(end)) problems.push(`${kase.id}: "${kase.algs["2H"].alg}" does not solve the case`);
    if (classifyF2L(puzzle, start)?.index !== kase.number) problems.push(`${kase.id}: classification does not map back to the case`);
  });
  return problems;
}
