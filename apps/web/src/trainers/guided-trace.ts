import { createRng, randomMoveSequence, trace, verifiedMoves, type Puzzle, type Scheme } from "@bld/cube-engine";
import { traceSteps, type TraceStep } from "./trace-steps";

/**
 * Guided trace mode (BRIEF §7.1): scrambles, the steps to read, the difficulty ramp, and the session
 * summary. All pure, so the ramp rules and the timing breakdown are tested without a browser.
 */

/** 1 full highlighting · 2 buffer only · 3 no highlighting · 4 no cube after a first look. */
export type Level = 1 | 2 | 3 | 4;
export type TracePieces = "corners" | "edges" | "both";

export const SCRAMBLE_LENGTH = 25;

/**
 * A scramble for one index of a seeded session: 25 random face turns, no face turned twice in a row.
 * Random-move rather than random-state (the engine's solver-backed provider) to keep the trainer free of
 * the solver's web worker for now; see docs/OVERNIGHT.md.
 */
export function sessionScramble(seed: string, index: number): string {
  const rng = createRng(`${seed}#${index}`);
  const faceTurns = verifiedMoves("3x3x3").filter((m) => /^[UDRLFB]['2]?$/.test(m));
  return randomMoveSequence(rng, faceTurns, SCRAMBLE_LENGTH).join(" ");
}

export interface PieceTrace {
  readonly pieceType: "corners" | "edges";
  readonly buffer: string;
  readonly steps: readonly TraceStep[];
  readonly parity: boolean;
}

/** Edges first, then corners, matching the solve order the path teaches. */
export function scrambleTraces(puzzle: Puzzle, scheme: Scheme, scramble: string, pieces: TracePieces, buffers: { corners: string; edges: string }, orientedInPlace: "asTargets" | "separate" = "asTargets"): PieceTrace[] {
  const kinds: ("corners" | "edges")[] = pieces === "both" ? ["edges", "corners"] : [pieces];
  return kinds.map((pieceType) => {
    const traced = trace(puzzle, { alg: scramble }, { pieceType, buffer: buffers[pieceType], scheme, policy: { orientedInPlace } });
    if (!traced.ok) throw new Error(`trace failed: ${JSON.stringify(traced.error)}`);
    return { pieceType, buffer: traced.value.buffer.sticker, steps: traceSteps(traced.value), parity: traced.value.parity };
  });
}

/** The kind of lookup a target needed, for the timing breakdown (BRIEF §8, trace diagnostics). */
export type LookupKind = "first" | "normal" | "break" | "twist";

export function lookupKind(step: TraceStep): LookupKind {
  if (step.kind === "orientationTarget") return "twist";
  if (step.chosen) return "break";
  if (step.index === 0) return "first";
  return "normal";
}

export interface TargetResult {
  readonly kind: LookupKind;
  readonly correct: boolean;
  readonly responseMs: number;
}

export interface ScrambleSummary {
  readonly targets: number;
  readonly errors: number;
  /** Median response time per lookup kind, only for kinds that occurred. */
  readonly medianMs: Partial<Record<LookupKind, number>>;
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function summarise(results: readonly TargetResult[]): ScrambleSummary {
  const medianMs: Partial<Record<LookupKind, number>> = {};
  for (const kind of ["first", "normal", "break", "twist"] as const) {
    const m = median(results.filter((r) => r.kind === kind).map((r) => r.responseMs));
    if (m !== undefined) medianMs[kind] = m;
  }
  return { targets: results.length, errors: results.filter((r) => !r.correct).length, medianMs };
}

/**
 * The automatic difficulty ramp (your 2026-09-15 answer): up a level after 3 scrambles in a row with no
 * wrong letters; down a level after 2 scrambles in a row with 3 or more errors. Choosing a level by
 * hand turns automatic changes off until they're turned back on. The streak restarts at every change.
 */
export interface RampState {
  readonly level: Level;
  readonly auto: boolean;
  /** Errors per scramble since the last level change, oldest first. */
  readonly streak: readonly number[];
}

export const UP_AFTER_CLEAN = 3;
export const DOWN_AFTER_BAD = 2;
export const BAD_ERRORS = 3;

export function startRamp(level: Level = 1): RampState {
  return { level, auto: true, streak: [] };
}

export function afterScramble(state: RampState, errors: number): RampState & { readonly changed: "up" | "down" | undefined } {
  const streak = [...state.streak, errors].slice(-Math.max(UP_AFTER_CLEAN, DOWN_AFTER_BAD));
  if (!state.auto) return { ...state, streak, changed: undefined };
  const lastClean = streak.slice(-UP_AFTER_CLEAN);
  if (lastClean.length === UP_AFTER_CLEAN && lastClean.every((e) => e === 0) && state.level < 4) {
    return { level: (state.level + 1) as Level, auto: true, streak: [], changed: "up" };
  }
  const lastBad = streak.slice(-DOWN_AFTER_BAD);
  if (lastBad.length === DOWN_AFTER_BAD && lastBad.every((e) => e >= BAD_ERRORS) && state.level > 1) {
    return { level: (state.level - 1) as Level, auto: true, streak: [], changed: "down" };
  }
  return { ...state, streak, changed: undefined };
}

export function chooseLevel(level: Level): RampState {
  return { level, auto: false, streak: [] };
}

export function resumeAuto(state: RampState): RampState {
  return { ...state, auto: true, streak: [] };
}

/** Explanations stop after this many correct answers of a kind (your 2026-09-15 answer). */
export const EXPLAIN_UNTIL_CORRECT = 3;

export function explanationWanted(kind: LookupKind, correctSoFar: Readonly<Partial<Record<LookupKind, number>>>, forced: boolean): boolean {
  if (forced) return true;
  if (kind !== "break" && kind !== "twist") return false;
  return (correctSoFar[kind] ?? 0) < EXPLAIN_UNTIL_CORRECT;
}
