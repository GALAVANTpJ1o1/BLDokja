import { cubingProvider, generateConstrained, seededStateProvider3x3, validateConstraints, type Puzzle, type Scheme, type TraceConstraints } from "@bld/cube-engine";
import { DifficultyPresetSchema, DifficultySchema, type Difficulty, type DifficultyPreset } from "@bld/storage";
import { browserEventScramble, solveBrowserState } from "@/lib/browser-scramble";

/**
 * The difficulty customiser (BRIEF §7.7): one settings object every trainer reads, applying the fields
 * that make sense for it. Scramble constraints go to the engine's constrained generation, which traces
 * every accepted scramble again, so a constrained scramble can't fail to match what you asked for.
 */

export const CASE_SUBSET_KEYS = ["m2op", "3style-corners", "3style-edges"] as const;
export type CaseSubsetKey = (typeof CASE_SUBSET_KEYS)[number];

/** The engine's trace constraints for the piece types in play, or undefined when nothing is constrained. */
export function traceConstraints(difficulty: Difficulty | undefined): TraceConstraints | undefined {
  const out: TraceConstraints = {};
  for (const pieceType of ["edges", "corners"] as const) {
    const piece = difficulty?.constraints?.[pieceType];
    if (piece === undefined || difficulty?.pieces === (pieceType === "edges" ? "corners" : "edges")) continue;
    // A range with neither bound set limits nothing.
    const cleaned = Object.fromEntries(Object.entries(piece).filter(([, v]) => !(typeof v === "object" && Object.keys(v).length === 0)));
    if (Object.keys(cleaned).length > 0) out[pieceType] = cleaned;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

export type ConstrainedScramble = { readonly ok: true; readonly scramble: string; readonly attempts: number } | { readonly ok: false; readonly reason: "invalid" | "budget-exhausted" | "error" };

/**
 * The scramble for one index of a seeded session that meets the constraints: random-state
 * candidates, traced with your buffers under the trainer's orientation policy, within a fixed budget.
 */
export async function constrainedScramble(
  puzzle: Puzzle,
  scheme: Scheme,
  buffers: { readonly corners: string; readonly edges: string },
  constraints: TraceConstraints,
  seed: string,
  index: number,
  orientedInPlace: "asTargets" | "separate" = "asTargets",
): Promise<ConstrainedScramble> {
  const names = Object.keys(constraints);
  const valid = validateConstraints(constraints, names);
  if (!valid.ok) return { ok: false, reason: "invalid" };
  const traceConfigs = Object.fromEntries(names.map((name) => [name, { pieceType: name as "corners" | "edges", buffer: buffers[name as "corners" | "edges"], scheme, policy: { orientedInPlace } }]));
  const browser = typeof window !== "undefined" && typeof Worker !== "undefined";
  const provider = puzzle.id === "3x3x3" ? seededStateProvider3x3(puzzle, { seed: `${seed}#${String(index)}`, orientation: "none", ...(browser ? { solve: solveBrowserState } : {}) }) : cubingProvider(puzzle, "444bf", browser ? browserEventScramble : undefined);
  const result = await generateConstrained(puzzle, { provider, traceConfigs, accept: valid.value, maxAttempts: 3000 });
  if (result.ok) return { ok: true, scramble: result.scramble, attempts: result.attempts };
  return { ok: false, reason: result.reason === "budget-exhausted" ? "budget-exhausted" : "error" };
}

export type TimeVerdict = "none" | "in-time" | "over-target" | "timed-out";

/** Soft time pressure marks a slow answer but keeps its grade; a hard cutoff makes it wrong. */
export function timeVerdict(difficulty: Difficulty | undefined, elapsedMs: number): TimeVerdict {
  const time = difficulty?.time;
  if (time === undefined || time.mode === "none") return "none";
  if (elapsedMs <= time.seconds * 1000) return "in-time";
  return time.mode === "soft" ? "over-target" : "timed-out";
}

/** Case ids to drill for a trainer's subset; every case when the subset is empty or matches none of them. */
export function subsetOf<T extends { readonly id: string }>(difficulty: Difficulty | undefined, key: CaseSubsetKey, cases: readonly T[]): { cases: readonly T[]; applied: boolean } {
  const chosen = difficulty?.cases?.[key];
  if (chosen === undefined || chosen.length === 0) return { cases, applied: false };
  const set = new Set(chosen);
  const kept = cases.filter((c) => set.has(c.id));
  return kept.length === 0 ? { cases, applied: false } : { cases: kept, applied: true };
}

const toBase64Url = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text: string) => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** A preset as a URL fragment (`#preset=…`): shareable, never sent to a server, and nothing personal in it. */
export function presetFragment(preset: DifficultyPreset): string {
  return `preset=${toBase64Url(JSON.stringify(preset))}`;
}

/** A shared preset read back from a fragment, validated like any stored preset. */
export function readPresetFragment(hash: string): DifficultyPreset | undefined {
  const match = /(?:^#?|&)preset=([A-Za-z0-9_-]+)/.exec(hash);
  if (match?.[1] === undefined) return undefined;
  try {
    const parsed = DifficultyPresetSchema.safeParse(JSON.parse(fromBase64Url(match[1])));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function isDifficulty(value: unknown): value is Difficulty {
  return DifficultySchema.safeParse(value).success;
}
