import { Alg } from "cubing/alg";
import type { KPattern } from "cubing/kpuzzle";
import type { Puzzle } from "../core/puzzle.js";
import type { Rng } from "../random/prng.js";
import { matchAnswer, solveStage } from "./classify.js";
import { algFor, firstTwoLayersIntact, styleMoves, type CuratedCase, type CuratedSet, type CuratedStage, type ExecutionStyle } from "./curated.js";
import type { CubeRenderMode } from "./render-modes.js";
import type { TrainerStage } from "./trainer-core.js";

/**
 * Last-layer recognition sessions (polish brief §43-48). A mode is a chain of stages; each stage is played on the
 * cube the previous stage's algorithm left behind, so a learner sees the cases a real solve produces:
 *
 *   recognise → execute → resulting state → recognise → execute → resulting state
 *
 * A start state is *built backwards* from legal algorithm applications (§58), so every stage of the chain is
 * solvable by exactly the curated algorithm the plan names, whatever the random AUFs. The forward run
 * then recognises each stage from the state alone (`solveStage`), and `validateChain` checks the two agree.
 */
export const LL_MODES = ["2look-oll", "2look-pll", "2look-ll", "1look-oll", "1look-pll", "2look-oll+1look-pll", "1look-oll+1look-pll"] as const;
export type LlMode = (typeof LL_MODES)[number];

/** The exact stage graph of each mode (§47). */
export const MODE_STAGES: Readonly<Record<LlMode, readonly CuratedStage[]>> = {
  "2look-oll": ["eo", "co"],
  "2look-pll": ["cp", "ep"],
  "2look-ll": ["eo", "co", "cp", "ep"],
  "1look-oll": ["oll"],
  "1look-pll": ["pll"],
  "2look-oll+1look-pll": ["eo", "co", "pll"],
  "1look-oll+1look-pll": ["oll", "pll"],
};

export type LlSets = Readonly<Record<CuratedStage, CuratedSet>>;

export const STAGE_DISPLAY: Readonly<Record<CuratedStage, CubeRenderMode>> = {
  eo: "OLL_EDGE_RECOGNITION", co: "OLL_FULL_RECOGNITION", oll: "OLL_FULL_RECOGNITION", cp: "PLL_RECOGNITION", ep: "PLL_RECOGNITION", pll: "PLL_RECOGNITION",
};

const AUFS = ["", "U", "U'", "U2"] as const;
const inv = (alg: string) => new Alg(alg).invert().toString();

export interface PlanStep { readonly stage: CuratedStage; readonly caseId: string }
export interface LlChain {
  /** Moves from a solved cube to the start state. */
  readonly setup: string;
  readonly start: KPattern;
  readonly plan: readonly PlanStep[];
}

export interface ChainOptions {
  /**
   * Which cases may be drawn at each stage (practice filters). A stage whose filter leaves nothing draws from every case. A
   * later stage is built into the start state, but what the learner meets there is whatever the earlier algorithms actually
   * left (a symmetric case can be solved from more than one AUF), so a filter steers later stages, it does not pin them.
   */
  readonly allowed?: (stage: CuratedStage, kase: CuratedCase) => boolean;
  /** Weight for drawing a case (weak cases more often). Defaults to 1. */
  readonly weight?: (stage: CuratedStage, kase: CuratedCase) => number;
}

function pick<T>(rng: Rng, items: readonly T[], weight?: (item: T) => number): T {
  if (weight === undefined) { const item = items[rng.int(items.length)]; if (item === undefined) throw new Error("nothing to pick"); return item; }
  const weights = items.map((item) => Math.max(0, weight(item)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pick(rng, items);
  let x = rng.float() * total;
  for (let i = 0; i < items.length; i += 1) { x -= weights[i] ?? 0; if (x < 0) { const item = items[i]; if (item !== undefined) return item; } }
  const last = items[items.length - 1]; if (last === undefined) throw new Error("nothing to pick"); return last;
}

/** Build a chain for a mode from a seed. Undefined only if the data cannot build one (the caller reports and logs). */
export function generateChain(puzzle: Puzzle, sets: LlSets, mode: LlMode, rng: Rng, style: ExecutionStyle = "2H", options: ChainOptions = {}): LlChain | undefined {
  const stages = MODE_STAGES[mode];
  const plan: PlanStep[] = [];
  const forward: string[] = [];
  stages.forEach((stage) => {
    const set = sets[stage];
    const pool = options.allowed === undefined ? set.cases : set.cases.filter((c) => options.allowed?.(stage, c) === true);
    const weight = options.weight;
    const kase = pick(rng, pool.length === 0 ? set.cases : pool, weight === undefined ? undefined : (c) => weight(stage, c));
    plan.push({ stage, caseId: kase.id });
    forward.push(AUFS[rng.int(4)] ?? "", styleMoves(algFor(kase, style).entry));
  });
  // A chain that stops before the last layer is solved ends in a realistic state (a random PLL case), not an unrelated one.
  const last = stages[stages.length - 1];
  if (last !== "pll" && last !== "ep") {
    const tail = pick(rng, sets.pll.cases);
    forward.push(AUFS[rng.int(4)] ?? "", styleMoves(algFor(tail, style).entry));
  } else forward.push(AUFS[rng.int(4)] ?? "");
  const setup = inv(forward.filter((part) => part !== "").join(" "));
  const start = puzzle.kpuzzle.defaultPattern().applyAlg(setup);
  if (!firstTwoLayersIntact(start)) return undefined;
  return { setup, start, plan };
}

/** Run a chain forward from its start state, recognising each stage from the state alone; returns what was recognised. */
export function validateChain(puzzle: Puzzle, sets: LlSets, mode: LlMode, chain: LlChain, style: ExecutionStyle = "2H"): { ok: true; recognised: readonly (string | null)[]; end: KPattern } | { ok: false; reason: string } {
  let state = chain.start;
  const recognised: (string | null)[] = [];
  for (const stage of MODE_STAGES[mode]) {
    const solution = solveStage(puzzle, state, stage, sets[stage], style);
    if (solution === undefined) return { ok: false, reason: `stage ${stage} is not recognised from the state it was given` };
    recognised.push(solution.case?.id ?? null);
    state = solution.result;
  }
  return { ok: true, recognised, end: state };
}

/** The first stage of a session, built from a chain; later stages are built from whatever state the previous one left. */
export function firstStage(puzzle: Puzzle, sets: LlSets, mode: LlMode, start: KPattern, style: ExecutionStyle = "2H"): TrainerStage<KPattern> | null {
  return stageAt(puzzle, sets, mode, 0, start, style);
}

function stageAt(puzzle: Puzzle, sets: LlSets, mode: LlMode, index: number, state: KPattern, style: ExecutionStyle): TrainerStage<KPattern> | null {
  const stages = MODE_STAGES[mode];
  const current = state;
  for (let i = index; i < stages.length; i += 1) {
    const stage = stages[i];
    if (stage === undefined) return null;
    const set = sets[stage];
    const solution = solveStage(puzzle, current, stage, set, style);
    if (solution === undefined) throw new Error(`trainer: stage ${stage} of ${mode} cannot be recognised from the cube it was handed`);
    // A stage the cube has already passed (oriented edges, corners already in place) is skipped. If it still needs
    // turning to line up, that turn is a stage of its own that the learner performs, not a silent change of the cube.
    if (solution.case === null) {
      if (solution.moves === "") continue;
      const nextIndex = i + 1;
      return {
        id: `${mode}:${i}:auf`,
        state: current,
        displayMode: STAGE_DISPLAY[stage],
        expected: { kind: "state", goal: solution.moves },
        successPredicate: () => true,
        onSuccess: { kind: "apply", moves: solution.moves },
        nextStageGenerator: (ended) => (nextIndex < stages.length ? stageAt(puzzle, sets, mode, nextIndex, ended, style) : null),
        metadata: { stage, caseId: "auf", moves: solution.moves, index: i, total: stages.length, autoAdvance: true },
      };
    }
    const kase = solution.case;
    const next = i + 1;
    return {
      id: `${mode}:${i}:${kase.id}`,
      state: current,
      displayMode: STAGE_DISPLAY[stage],
      expected: { kind: "case", caseId: kase.id, label: kase.name },
      aliases: [kase.name, ...kase.aliases],
      successPredicate: (_state, response) => {
        if (response === undefined) return false;
        if (response.kind === "name") return matchAnswer(set, response.text).some((c) => c.id === kase.id);
        if (response.kind === "select") return response.ids.length === 1 && response.ids[0] === kase.id;
        return false;
      },
      onSuccess: { kind: "apply", moves: solution.moves },
      nextStageGenerator: (ended) => (next < stages.length ? stageAt(puzzle, sets, mode, next, ended, style) : null),
      metadata: { stage, caseId: kase.id, group: kase.group, number: kase.number, moves: solution.moves, preAuf: solution.preAuf, postAuf: solution.postAuf, style: solution.style, fallback: solution.fallback, index: i, total: stages.length },
    };
  }
  return null;
}
