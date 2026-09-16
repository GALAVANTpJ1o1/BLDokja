import { cancelMoves, drillScramble, expandNodes, formatMoves, parseAlg, randomMoveSequence, solveOpOp, stepMoves, trace, verifiedMoves, type AlgDataset, type MethodStep, type OpParityDataset, type OpSetupsDataset, type Puzzle, type Rng, type Scheme, type SwapDataset } from "@bld/cube-engine";
import { misplacedPieces } from "./effects";
import { checkUserAlg } from "./three-style";

/**
 * Checkpoint items for 3BLD lessons 16–23: M2, diagnosing a failed solve, and commutators. Every answer
 * is computed by the engine from the verified datasets, and every typed answer is graded by what it does.
 */

export type MistakeKind = "parity" | "letters" | "undo";
export const MISTAKES: readonly MistakeKind[] = ["parity", "letters", "undo"];

export type LessonItem =
  | { readonly kind: "m2-setup"; readonly target: string; readonly letter: string; readonly answer: string }
  | { readonly kind: "m2-special"; readonly target: string; readonly letter: string; readonly position: "odd" | "even"; readonly answer: string }
  | { readonly kind: "comm-expand"; readonly comm: string; readonly answer: string }
  | { readonly kind: "comm-case"; readonly pieces: "corners" | "edges"; readonly buffer: string; readonly scramble: string; readonly answer: readonly [string, string] }
  | { readonly kind: "comm-build"; readonly pieces: "corners" | "edges"; readonly buffer: string; readonly recordId: string; readonly targets: readonly [string, string]; readonly letters: string; readonly answer: string }
  | { readonly kind: "mistake"; readonly scramble: string; readonly executed: string; readonly answer: MistakeKind };

function pickDistinct<T>(rng: Rng, pool: readonly T[], count: number, key: (item: T) => string): T[] {
  const out: T[] = [];
  const used = new Set<string>();
  while (out.length < Math.min(count, pool.length)) {
    const item = pool[rng.int(pool.length)];
    if (item === undefined || used.has(key(item))) continue;
    used.add(key(item));
    out.push(item);
  }
  return out;
}

export function m2SetupItems(scheme: Scheme, rng: Rng, dataset: SwapDataset, count: number): LessonItem[] {
  const targets = dataset.records.flatMap((r) => (r.kind === "target" && r.setup !== "" ? [r] : []));
  return pickDistinct(rng, targets, count, (r) => r.target).map((r) => ({ kind: "m2-setup", target: r.target, letter: scheme.letters.edges?.[r.target] ?? "", answer: r.setup }));
}

/** A special target in a position: on an odd step (the second of a pair) the dataset's rule names another target's alg. */
export function m2SpecialItems(scheme: Scheme, rng: Rng, dataset: SwapDataset, count: number): LessonItem[] {
  const pool = dataset.specialTargets.flatMap((target) => (["odd", "even"] as const).map((position) => ({ target, position })));
  return pickDistinct(rng, pool, count, (c) => `${c.target}:${c.position}`).map(({ target, position }) => ({
    kind: "m2-special",
    target,
    letter: scheme.letters.edges?.[target] ?? "",
    position,
    answer: position === "odd" ? (dataset.oddStepRule.find((r) => r.target === target)?.shootAs ?? target) : target,
  }));
}

/** Pure commutators [A, B] from a 3-style dataset, short enough to expand by hand. */
export function commExpandItems(rng: Rng, dataset: AlgDataset, count: number): LessonItem[] {
  const pool = dataset.records.flatMap((r) => r.algs.filter((a) => /^\[[^\]:[]+, [^\]:[]+\]$/.test(a.alg) && a.etm <= 8).map((a) => ({ comm: a.alg, moves: a.moves })));
  return pickDistinct(rng, pool, count, (c) => c.comm).map((c) => ({ kind: "comm-expand", comm: c.comm, answer: c.moves }));
}

/** Any written form of the same moves counts: the typed moves are expanded and cancelled, then compared. */
export function gradeExpansion(puzzle: Puzzle, item: Extract<LessonItem, { kind: "comm-expand" }>, typed: string): boolean {
  const parsed = parseAlg(puzzle.id, typed.trim());
  return parsed.ok && typed.trim() !== "" && formatMoves(cancelMoves(puzzle.id, expandNodes(parsed.value.nodes))) === item.answer;
}

/** A 3-style case set up on the cube: trace its two targets from the buffer. */
export function commCaseItems(puzzle: Puzzle, scheme: Scheme, rng: Rng, dataset: AlgDataset, count: number): LessonItem[] {
  const pieces = dataset.pieceType;
  const records = dataset.records.filter((r) => r.kind === "cycle");
  const items: LessonItem[] = [];
  for (const record of pickDistinct(rng, records, count * 3, (r) => r.id)) {
    if (items.length >= count) break;
    const drill = drillScramble(puzzle, record.algs[0]?.moves ?? "");
    if (!drill.ok) continue;
    const traced = trace(puzzle, { alg: drill.value.scramble }, { pieceType: pieces, buffer: dataset.buffer, scheme, policy: { orientedInPlace: "separate" } });
    const [first, second] = traced.ok ? traced.value.targets : [];
    if (!traced.ok || traced.value.targetCount !== 2 || first === undefined || second === undefined) continue;
    items.push({ kind: "comm-case", pieces, buffer: dataset.buffer, scramble: drill.value.scramble, answer: [first, second] });
  }
  return items;
}

export function commBuildItems(scheme: Scheme, rng: Rng, dataset: AlgDataset, count: number): LessonItem[] {
  const pieces = dataset.pieceType;
  const records = dataset.records.flatMap((r) => (r.kind === "cycle" ? [r] : []));
  return pickDistinct(rng, records, count, (r) => r.id).map((r) => {
    const [a, b] = r.targets;
    return { kind: "comm-build", pieces, buffer: dataset.buffer, recordId: r.id, targets: [a, b] as const, letters: `${scheme.letters[pieces]?.[a] ?? "?"}${scheme.letters[pieces]?.[b] ?? "?"}`, answer: r.algs[0]?.alg ?? "" };
  });
}

/** A comm you wrote is right if the engine confirms it solves the case, whatever its shape. */
export function gradeCommBuild(puzzle: Puzzle, dataset: AlgDataset, item: Extract<LessonItem, { kind: "comm-build" }>, typed: string): boolean {
  return checkUserAlg(puzzle, dataset, item.recordId, typed).ok;
}

export interface OpDatasets {
  readonly corners: OpSetupsDataset;
  readonly edges: OpSetupsDataset;
  readonly parity: OpParityDataset;
}

/** What each mistake leaves on the cube, checked for every generated item (and stated in lesson 18). */
export function mistakeSignature(puzzle: Puzzle, shown: string): MistakeKind | undefined {
  const { corners, edges } = misplacedPieces(puzzle, shown);
  if (corners.length === 2 && edges.length === 2) return "parity";
  if ((corners.length === 3 && edges.length === 0) || (edges.length === 3 && corners.length === 0)) return "letters";
  if (corners.length + edges.length >= 5) return "undo";
  return undefined;
}

/**
 * An Old Pochmann solve of a scramble with one mistake in it, or undefined if the scramble can't show that
 * mistake: the parity step left out (needs an odd count), the first two same-type targets done in the wrong
 * order, or the first setup done twice instead of undone. The result must show the mistake's signature.
 */
export function mistakeFor(puzzle: Puzzle, scheme: Scheme, datasets: OpDatasets, scramble: string, kind: MistakeKind): string | undefined {
  const solved = solveOpOp(puzzle, { alg: scramble }, { scheme, ...datasets });
  if (!solved.ok) return undefined;
  const steps = solved.value.steps.filter((s) => s.kind !== "frame");
  let wrong: MethodStep[] | undefined;
  if (kind === "parity") {
    if (steps.some((s) => s.kind === "parity")) wrong = steps.filter((s) => s.kind !== "parity");
  } else if (kind === "letters") {
    const at = steps.findIndex((s, j) => {
      const next = steps[j + 1];
      return s.kind === "target" && next?.kind === "target" && next.pieceType === s.pieceType;
    });
    const here = steps[at];
    const next = steps[at + 1];
    if (at >= 0 && here !== undefined && next !== undefined) wrong = [...steps.slice(0, at), next, here, ...steps.slice(at + 2)];
  } else {
    const at = steps.findIndex((s) => s.kind === "target" && s.setup.length > 0);
    const step = steps[at];
    if (step?.kind === "target") wrong = [...steps.slice(0, at), { ...step, undo: step.setup }, ...steps.slice(at + 1)];
  }
  if (wrong === undefined) return undefined;
  const executed = formatMoves(wrong.flatMap((st) => [...stepMoves(st)]));
  return mistakeSignature(puzzle, `${scramble} ${executed}`) === kind ? executed : undefined;
}

/** Checkpoint items: short scrambles, each with one mistake of a kind, kept only when it shows that kind's signature. */
export function mistakeItems(puzzle: Puzzle, scheme: Scheme, rng: Rng, datasets: OpDatasets, count: number): LessonItem[] {
  const faces = verifiedMoves("3x3x3").filter((m) => /^[UDRLFB]['2]?$/.test(m));
  return Array.from({ length: count }, (_, i) => {
    const kind = MISTAKES[(i + rng.int(MISTAKES.length)) % MISTAKES.length] ?? "parity";
    for (let attempt = 0; attempt < 4000; attempt++) {
      const scramble = randomMoveSequence(rng, faces, 4 + rng.int(4)).join(" ");
      const executed = mistakeFor(puzzle, scheme, datasets, scramble, kind);
      if (executed !== undefined) return { kind: "mistake" as const, scramble, executed, answer: kind };
    }
    throw new Error(`no ${kind} mistake found`);
  });
}
