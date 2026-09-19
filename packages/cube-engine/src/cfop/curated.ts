import { Alg } from "cubing/alg";
import type { KPattern } from "cubing/kpuzzle";
import { centersRotation } from "../core/frame.js";
import type { Puzzle } from "../core/puzzle.js";
import {
  CURATED_STAGES, EXECUTION_STYLES, CaseStateSchema, CuratedAlgSchema, CuratedCaseSchema, CuratedSetSchema, algFor, combineAuf, styleMoves,
  type CaseState, type CuratedAlg, type CuratedCase, type CuratedSet, type CuratedStage, type ExecutionStyle,
} from "./schema.js";
export {
  CURATED_STAGES, EXECUTION_STYLES, CaseStateSchema, CuratedAlgSchema, CuratedCaseSchema, CuratedSetSchema, algFor, combineAuf, styleMoves,
  type CaseState, type CuratedAlg, type CuratedCase, type CuratedSet, type CuratedStage, type ExecutionStyle,
};
import { lastLayerStageSatisfied, coPattern, cornerPermPattern, edgePermPattern, eoPattern, ollPattern, pllPattern, type LastLayerKind } from "../data/last-layer.js";

/**
 * Curated CFOP case data (DECISIONS D-080). One record per case a learner knows by name, each with the
 * human algorithm to execute it, in two execution styles. Case state, display orientation and
 * algorithm are separate fields on purpose:
 *
 *  - `state`: the physical last-layer state, an engine pattern built by a validated constructor.
 *  - `algs[style]`: the sequence, the U turns to put before and after it, and how the cube is held
 *    when it starts and ends. Nothing about how the case is *shown* is stored here.
 *  - display orientation lives in the display layer (`orientation.ts`), never in this data.
 *
 * Every record is verified against the engine (`verifyCuratedSet`); nothing here is solver output.
 */

/** The engine's stage kind for each curated stage. */
export const STAGE_KIND: Readonly<Record<CuratedStage, LastLayerKind>> = { eo: "eo", co: "co", cp: "corner-perm", ep: "edge-perm", oll: "oll", pll: "pll" };

const AUFS = ["", "U", "U'", "U2"] as const;
const inv = (alg: string): string => new Alg(alg).invert().toString();

/** Build the engine pattern for a stored case state. */
export function casePattern(puzzle: Puzzle, stage: CuratedStage, state: CaseState): KPattern {
  const need = <T,>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Error(`${stage} case state is missing ${what}`);
    return value;
  };
  switch (stage) {
    case "eo": return eoPattern(puzzle, { edges: need(state.eo, "eo") });
    case "co": return coPattern(puzzle, { corners: need(state.co, "co") });
    case "cp": return cornerPermPattern(puzzle, { corners: need(state.cp, "cp") });
    case "ep": return edgePermPattern(puzzle, { edges: need(state.ep, "ep") });
    case "oll": return ollPattern(puzzle, { corners: need(state.co, "co"), edges: need(state.eo, "eo") });
    case "pll": return pllPattern(puzzle, { corners: need(state.cp, "cp"), edges: need(state.ep, "ep") });
  }
}

/**
 * The starting state of an algorithm, centres in place: it ends solved in some frame, which is not restored.
 * `leadingAuf` turns the last layer first, which relabels which slot each piece belongs to: an algorithm that
 * includes a net U turn (an M-slice Z permutation, say) starts from a state whose corners are a quarter turn
 * out of place, and a stage that assumes solved corners has to start from the aligned version instead.
 */
export function algStartState(puzzle: Puzzle, alg: string, leadingAuf: "" | "U" | "U2" | "U'" = ""): KPattern | undefined {
  const solved = puzzle.kpuzzle.defaultPattern();
  const rot = centersRotation(puzzle, solved.applyAlg(alg));
  if (rot === undefined) return undefined;
  const framed = (leadingAuf === "" ? solved : solved.applyAlg(leadingAuf));
  return (rot.alg === "" ? framed : framed.applyAlg(inv(rot.alg))).applyAlg(inv(alg));
}

/**
 * The start state for a stage: as `algStartState`, except that edge permutation (which assumes the corners
 * are solved) picks the leading AUF that makes them so.
 */
export function stageStartState(puzzle: Puzzle, stage: CuratedStage, alg: string): KPattern | undefined {
  if (stage !== "ep") return algStartState(puzzle, alg);
  for (const leading of AUFS) {
    const start = algStartState(puzzle, alg, leading);
    const corners = start?.patternData.CORNERS;
    if (start !== undefined && corners !== undefined && corners.pieces.slice(0, 4).every((piece, i) => piece === i)) return start;
  }
  return undefined;
}

/**
 * Moves from a solved cube to the state a case is drawn in: the primary algorithm's own starting state (with the
 * leading AUF an edge-permutation case needs). Playing the case's algorithm from here solves it, so a 3D cube
 * and a diagram built from it always agree.
 */
export function caseSetup(puzzle: Puzzle, stage: CuratedStage, kase: CuratedCase): string {
  const alg = (kase.algs["2H"] ?? kase.algs.OH)?.alg;
  if (alg === undefined) throw new Error(`case ${kase.id} has no algorithm`);
  const rotation = endingRotationOf(puzzle, alg);
  if (rotation === undefined) throw new Error(`case ${kase.id}: no centre frame`);
  const back = rotation === "" ? "" : inv(rotation);
  for (const leading of AUFS) {
    const start = algStartState(puzzle, alg, leading);
    if (start !== undefined && JSON.stringify(stateFromStart(stage, start)) === JSON.stringify(kase.state)) return [leading, back, inv(alg)].filter((part) => part !== "").join(" ");
  }
  throw new Error(`case ${kase.id}: no setup reproduces the stored state`);
}

/** The rotation that returns the centres after `alg` (empty if none is needed). */
export function endingRotationOf(puzzle: Puzzle, alg: string): string | undefined {
  return centersRotation(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(alg))?.alg;
}

/** The case state an algorithm solves, read off its starting state. */
export function stateFromStart(stage: CuratedStage, start: KPattern): CaseState {
  const corners = start.patternData.CORNERS; const edges = start.patternData.EDGES;
  if (corners === undefined || edges === undefined) throw new Error("no CORNERS/EDGES orbit");
  const co = corners.orientation.slice(0, 4) as [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2];
  const eo = edges.orientation.slice(0, 4) as [0 | 1, 0 | 1, 0 | 1, 0 | 1];
  const cp = corners.pieces.slice(0, 4) as [0 | 1 | 2 | 3, 0 | 1 | 2 | 3, 0 | 1 | 2 | 3, 0 | 1 | 2 | 3];
  const ep = edges.pieces.slice(0, 4) as [0 | 1 | 2 | 3, 0 | 1 | 2 | 3, 0 | 1 | 2 | 3, 0 | 1 | 2 | 3];
  switch (stage) {
    case "eo": return { eo };
    case "co": return { co };
    case "cp": return { cp };
    case "ep": return { ep };
    case "oll": return { co, eo };
    case "pll": return { cp, ep };
  }
}

/** Whether every piece outside the last layer is home and unturned. */
export function firstTwoLayersIntact(pattern: KPattern): boolean {
  const c = pattern.patternData.CORNERS; const e = pattern.patternData.EDGES;
  if (c === undefined || e === undefined) return false;
  return [c, e].every((orbit) => orbit.pieces.slice(4).every((piece, i) => piece === i + 4) && orbit.orientation.slice(4).every((v) => v === 0));
}

/**
 * The AUFs that make `alg` reach the stage goal from `state`, fewest turns first (before-turns, then
 * after-turns). Stages that need no alignment (orientation stages) never get a post-AUF.
 */
export function findAufs(puzzle: Puzzle, state: KPattern, alg: string, stage: CuratedStage): { readonly pre: "" | "U" | "U2" | "U'"; readonly post: "" | "U" | "U2" | "U'" } | undefined {
  const kind = STAGE_KIND[stage];
  const alignPost = stage === "cp" || stage === "ep" || stage === "pll";
  const cost = (a: string) => (a === "" ? 0 : a === "U2" ? 2 : 1);
  const options: { pre: (typeof AUFS)[number]; post: (typeof AUFS)[number] }[] = [];
  for (const pre of AUFS) for (const post of alignPost ? AUFS : (["" ] as const)) options.push({ pre, post });
  options.sort((a, b) => cost(a.pre) + cost(a.post) - cost(b.pre) - cost(b.post));
  for (const option of options) {
    const text = [option.pre, alg, endingRotationOf(puzzle, alg) ?? "", option.post].filter((part) => part !== "").join(" ");
    const result = state.applyAlg(text);
    if (firstTwoLayersIntact(centred(puzzle, result)) && lastLayerStageSatisfied(puzzle, result, kind)) return option;
  }
  return undefined;
}

function centred(puzzle: Puzzle, pattern: KPattern): KPattern {
  return centersRotation(puzzle, pattern)?.pattern ?? pattern;
}

export interface CuratedProblem {
  readonly case: string;
  readonly style?: ExecutionStyle;
  readonly reason: string;
}

/**
 * Verify a whole set against the engine: every stored algorithm solves its case (with the stored
 * AUFs), keeps the first two layers, has the stored move count and ending rotation; the case states
 * are valid and pairwise distinct up to the AUF symmetry; ids are unique.
 */
export function verifyCuratedSet(puzzle: Puzzle, set: CuratedSet): CuratedProblem[] {
  const problems: CuratedProblem[] = [];
  const ids = new Set<string>();
  const signatures = new Map<string, string>();
  for (const kase of set.cases) {
    if (ids.has(kase.id)) problems.push({ case: kase.id, reason: "duplicate id" });
    ids.add(kase.id);
    let pattern: KPattern;
    try { pattern = casePattern(puzzle, set.stage, kase.state); } catch (error) { problems.push({ case: kase.id, reason: `invalid case state: ${String(error)}` }); continue; }
    if (!firstTwoLayersIntact(pattern)) problems.push({ case: kase.id, reason: "case state disturbs the first two layers" });
    for (const style of EXECUTION_STYLES) {
      const entry = kase.algs[style];
      if (entry === undefined) { if (!kase.missing.includes(style)) problems.push({ case: kase.id, style, reason: "missing algorithm is not declared" }); continue; }
      if (kase.missing.includes(style)) problems.push({ case: kase.id, style, reason: "declared missing but present" });
      try {
        const result = pattern.applyAlg(styleMoves(entry));
        if (!firstTwoLayersIntact(centred(puzzle, result))) problems.push({ case: kase.id, style, reason: "does not keep the first two layers" });
        if (!lastLayerStageSatisfied(puzzle, result, STAGE_KIND[set.stage])) problems.push({ case: kase.id, style, reason: `does not reach the ${set.stage} goal from the stored state` });
        const rotation = endingRotationOf(puzzle, entry.alg);
        if (rotation !== entry.endingRotation) problems.push({ case: kase.id, style, reason: `ending rotation is "${rotation ?? "?"}", stored "${entry.endingRotation}"` });
      } catch (error) { problems.push({ case: kase.id, style, reason: `cannot apply: ${String(error)}` }); }
    }
    const signature = JSON.stringify(kase.state);
    const prior = signatures.get(signature);
    if (prior !== undefined) problems.push({ case: kase.id, reason: `same state as ${prior}` });
    signatures.set(signature, kase.id);
  }
  return problems;
}
