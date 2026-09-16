import type { KPattern } from "cubing/kpuzzle";
import { randomScrambleForEvent } from "cubing/scramble";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import { centersRotation, normaliseByCenters, wholeCubeRotationAlgs } from "../core/frame.js";
import { verifiedMoves, type Puzzle, type PuzzleId } from "../core/puzzle.js";
import { expandNodes, formatMoves, invertMoves } from "../commutator/expand.js";
import { parseAlg } from "../commutator/parse.js";
import { createRng } from "../random/prng.js";
import { randomMoveSequence, randomState3x3 } from "../random/random-state.js";

/**
 * Scramble providers (BRIEF §5.6, DECISIONS D-027): a port every trainer draws scrambles from.
 *
 * A candidate gives its state right away and its scramble on demand, so constrained generation can
 * reject states without paying for the solver. For 3x3 the state is rotated so its centres are
 * solved: the frame tracing uses.
 */

export interface ScrambleCandidate {
  /** The state after the scramble; on 3x3 rotated so the centres are solved, on 4x4 as it is. */
  readonly state: KPattern;
  /** The scramble that produces `state`. Computed on first call, then cached. */
  scramble(): Promise<string>;
}

export interface ScrambleProvider {
  readonly puzzle: PuzzleId;
  next(): Promise<ScrambleCandidate>;
}

/** A plain move sequence from cubing.js notation, through the engine's parser (throws if a move isn't verified). */
function canonical(puzzleId: PuzzleId, text: string, invert: boolean): string {
  const parsed = parseAlg(puzzleId, text);
  if (!parsed.ok) throw new Error(`"${text}" doesn't parse: ${JSON.stringify(parsed.error)}`);
  const moves = expandNodes(parsed.value.nodes);
  return formatMoves(invert ? invertMoves(moves) : moves);
}

const WIDE_FAMILIES = ["Uw", "Rw", "Fw"] as const;
const suffixCache = new WeakMap<Puzzle, readonly string[]>();

/**
 * One wide-move suffix per whole-cube orientation, in `wholeCubeRotationAlgs` order: the first
 * shortest sequence of Uw, Rw and Fw turns (no family twice in a row) that leaves the cube in that
 * orientation, the way 333bf scrambles end.
 */
export function orientationSuffixes(puzzle: Puzzle): readonly string[] {
  const cached = suffixCache.get(puzzle);
  if (cached !== undefined) return cached;
  const single = WIDE_FAMILIES.flatMap((family) => [family, `${family}'`, `${family}2`]);
  const candidates = ["", ...single, ...single.flatMap((a) => single.filter((b) => b.slice(0, 2) !== a.slice(0, 2)).map((b) => `${a} ${b}`))];
  const byRotation = new Map<string, string>();
  for (const candidate of candidates) {
    const rotation = centersRotation(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(candidate));
    if (rotation !== undefined && !byRotation.has(rotation.alg)) byRotation.set(rotation.alg, candidate);
  }
  const suffixes = wholeCubeRotationAlgs(puzzle).map((r) => {
    const suffix = byRotation.get(r.alg);
    if (suffix === undefined) throw new Error(`no wide-move suffix for orientation ${r.alg}`);
    return suffix;
  });
  suffixCache.set(puzzle, suffixes);
  return suffixes;
}

export interface SeededProviderOptions {
  readonly seed: string;
  /** `wide` (default): a uniformly random orientation, written as a wide-move suffix. `none`: no suffix. */
  readonly orientation?: "wide" | "none";
  /** Solver port for hosts serving cubing.js outside their application bundler. */
  readonly solve?: (pattern: KPattern) => Promise<string>;
}

/**
 * Uniform random 3x3 states from a seeded generator (D-012), each solved by cubing.js's solver and
 * inverted into a scramble. The same seed gives the same sequence of states (and, with the pinned
 * cubing.js, the same scramble strings).
 */
export function seededStateProvider3x3(puzzle: Puzzle, options: SeededProviderOptions): ScrambleProvider {
  if (puzzle.id !== "3x3x3") throw new RangeError("seededStateProvider3x3 needs the 3x3x3 puzzle");
  const rng = createRng(options.seed);
  const suffixes = options.orientation === "none" ? undefined : orientationSuffixes(puzzle);
  return {
    puzzle: puzzle.id,
    next: () => {
      const prefixState = randomState3x3(puzzle, rng);
      const suffix = suffixes === undefined ? "" : (suffixes[rng.int(suffixes.length)] ?? "");
      const state = normaliseByCenters(puzzle, suffix === "" ? prefixState : prefixState.applyAlg(suffix));
      if (state === undefined) throw new Error("a sampled state has no centre frame");
      let pending: Promise<string> | undefined;
      const scramble = () => {
        pending ??= (options.solve === undefined ? experimentalSolve3x3x3IgnoringCenters(prefixState).then((solution) => solution.toString()) : options.solve(prefixState)).then((solution) => [canonical(puzzle.id, solution, true), suffix].filter((part) => part !== "").join(" "));
        return pending;
      };
      return Promise.resolve({ state, scramble });
    },
  };
}

export interface SeededMoveProviderOptions {
  readonly seed: string;
  /** Moves to draw from, each verified for the puzzle. Default: the face turns U D R L F B with ' and 2. */
  readonly moves?: readonly string[];
  /** Moves per scramble. Default 25. */
  readonly length?: number;
}

/**
 * Seeded random-move scrambles: no two consecutive moves of one family, and no solver. States aren't
 * uniformly distributed, but after 25 face turns they're close enough for practice, and the provider
 * runs anywhere, including a browser where cubing.js's search worker isn't available. The same seed
 * gives the same scrambles. On 3x3 the state is rotated so the centres are solved, like every provider.
 */
export function seededMoveProvider(puzzle: Puzzle, options: SeededMoveProviderOptions): ScrambleProvider {
  const verified = new Set(verifiedMoves(puzzle.id));
  const moves = options.moves ?? verifiedMoves(puzzle.id).filter((m) => /^[UDRLFB]['2]?$/.test(m));
  const unverified = moves.filter((m) => !verified.has(m));
  if (unverified.length > 0) throw new RangeError(`moves not verified for ${puzzle.id}: ${unverified.join(" ")}`);
  if (moves.length === 0) throw new RangeError("no moves to draw from");
  const length = options.length ?? 25;
  if (!Number.isInteger(length) || length < 1) throw new RangeError(`length must be a positive integer, not ${String(length)}`);
  const rng = createRng(options.seed);
  return {
    puzzle: puzzle.id,
    next: () => {
      const text = canonical(puzzle.id, randomMoveSequence(rng, moves, length).join(" "), false);
      const applied = puzzle.kpuzzle.defaultPattern().applyAlg(text);
      const state = puzzle.id === "3x3x3" ? normaliseByCenters(puzzle, applied) : applied;
      if (state === undefined) throw new Error(`"${text}" has no centre frame`);
      return Promise.resolve({ state, scramble: () => Promise.resolve(text) });
    },
  };
}

export type CubingEvent = "333bf" | "444bf" | "555bf";

/** cubing.js's `randomScrambleForEvent`: official-style random scrambles, not seeded. */
export function cubingProvider(puzzle: Puzzle, event: CubingEvent, generate?: (event: CubingEvent) => Promise<string>): ScrambleProvider {
  const expected: PuzzleId = event === "333bf" ? "3x3x3" : event === "444bf" ? "4x4x4" : "5x5x5";
  if (puzzle.id !== expected) throw new RangeError(`${event} scrambles need the ${expected} puzzle`);
  return {
    puzzle: puzzle.id,
    next: async () => {
      const text = canonical(puzzle.id, generate === undefined ? (await randomScrambleForEvent(event)).toString() : await generate(event), false);
      const applied = puzzle.kpuzzle.defaultPattern().applyAlg(text);
      const state = puzzle.id === "3x3x3" ? normaliseByCenters(puzzle, applied) : applied;
      if (state === undefined) throw new Error(`"${text}" has no centre frame`);
      return { state, scramble: () => Promise.resolve(text) };
    },
  };
}

/** The next scramble and its state. */
export async function nextScramble(provider: ScrambleProvider): Promise<{ readonly scramble: string; readonly state: KPattern }> {
  const candidate = await provider.next();
  return { scramble: await candidate.scramble(), state: candidate.state };
}
