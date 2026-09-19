import type { KPattern } from "cubing/kpuzzle";
import { centersRotation } from "../core/frame.js";
import type { Puzzle } from "../core/puzzle.js";
import { lastLayerStageSatisfied } from "../data/last-layer.js";
import {
  algFor, casePattern, endingRotationOf, firstTwoLayersIntact, STAGE_KIND, styleMoves,
  type CuratedCase, type CuratedSet, type CuratedStage, type ExecutionStyle,
} from "./curated.js";

/**
 * State-authoritative recognition (BRIEF-polish §55). A case is *whatever curated case, with whatever AUFs, the
 * engine says solves this exact cube state*. No id, filename, index or picture is consulted, so the same call
 * serves a lesson, a reference card and every step of a chained trainer session.
 */

const AUFS = ["", "U", "U'", "U2"] as const;
type Auf = (typeof AUFS)[number];
const aufCost = (a: string) => (a === "" ? 0 : a === "U2" ? 2 : 1);

export interface StageSolution {
  /** The curated case the state is (null when the stage needs at most an AUF). */
  readonly case: CuratedCase | null;
  readonly style: ExecutionStyle;
  /** True when the requested style had no row and the other one was used. */
  readonly fallback: boolean;
  readonly preAuf: Auf;
  readonly postAuf: Auf;
  /** Everything to execute, in order: pre-AUF, the algorithm, the rotation that restores the hold, post-AUF. */
  readonly moves: string;
  /** The state after `moves`: centres in place, stage goal met. */
  readonly result: KPattern;
}

/** Whether a state (centres in place, or not) meets a stage goal with the first two layers intact. */
export function stageSatisfied(puzzle: Puzzle, state: KPattern, stage: CuratedStage): boolean {
  const centred = centersRotation(puzzle, state)?.pattern;
  return centred !== undefined && firstTwoLayersIntact(centred) && lastLayerStageSatisfied(puzzle, state, STAGE_KIND[stage]);
}

/**
 * Find the curated case and the AUFs that solve `state` at `stage`. `state` must have its centres in place (use
 * `normaliseByCenters` first). Undefined means the state is not a case of this stage: the first two layers are
 * broken, a prerequisite stage is unmet, or (for the 2-look permutation stages) no one algorithm solves it.
 * The stored AUFs on a case are how it is *drawn* against its stored state; recognition here ignores them and
 * finds the fewest-turn AUFs for the state actually in hand.
 */
export function solveStage(puzzle: Puzzle, state: KPattern, stage: CuratedStage, set: CuratedSet, style: ExecutionStyle): StageSolution | undefined {
  if (set.stage !== stage) return undefined;
  if (!firstTwoLayersIntact(state)) return undefined;
  const centres = centersRotation(puzzle, state);
  if (centres === undefined || centres.alg !== "") return undefined;
  const alignPost = stage === "cp" || stage === "ep" || stage === "pll";
  const posts: readonly Auf[] = alignPost ? AUFS : [""];
  const kind = STAGE_KIND[stage];
  const ok = (pattern: KPattern) => firstTwoLayersIntact(centersRotation(puzzle, pattern)?.pattern ?? pattern) && lastLayerStageSatisfied(puzzle, pattern, kind);

  // Already done (possibly after an AUF): nothing to recognise.
  for (const post of posts) {
    const done = post === "" ? state : state.applyAlg(post);
    if (ok(done)) return { case: null, style, fallback: false, preAuf: "", postAuf: post, moves: post, result: done };
  }

  let best: StageSolution | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const kase of set.cases) {
    const { entry, style: used, fallback } = algFor(kase, style);
    const body = [entry.alg, entry.endingRotation].filter((part) => part !== "").join(" ");
    for (const pre of AUFS) {
      if (aufCost(pre) >= bestCost) continue;
      const ran = (pre === "" ? state : state.applyAlg(pre)).applyAlg(body);
      for (const post of posts) {
        const cost = aufCost(pre) + aufCost(post);
        if (cost >= bestCost) continue;
        const result = post === "" ? ran : ran.applyAlg(post);
        if (!ok(result)) continue;
        bestCost = cost;
        best = { case: kase, style: used, fallback, preAuf: pre, postAuf: post, moves: [pre, entry.alg, entry.endingRotation, post].filter((part) => part !== "").join(" "), result };
      }
    }
  }
  return best;
}

/** Normalise a typed answer: case, spacing and punctuation never make it wrong ("Anti-Sune", "anti sune", "antisune"). */
export function normaliseAnswer(text: string): string {
  return text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The cases a typed answer names (normally one). */
export function matchAnswer(set: CuratedSet, text: string): CuratedCase[] {
  const wanted = normaliseAnswer(text);
  if (wanted === "") return [];
  return set.cases.filter((kase) => [kase.name, kase.id, ...kase.aliases].some((alias) => normaliseAnswer(alias) === wanted));
}

/** Rebuild a stage's executable text from a stored entry, for callers that already know the case. */
export function executableMoves(kase: CuratedCase, style: ExecutionStyle): { moves: string; style: ExecutionStyle; fallback: boolean } {
  const { entry, style: used, fallback } = algFor(kase, style);
  return { moves: styleMoves(entry), style: used, fallback };
}

export { casePattern, endingRotationOf };
