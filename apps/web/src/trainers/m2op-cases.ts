import { formatMoves, solveM2Op, solveOpOp, stepMoves, type AlgMove, type M2Dataset, type OpSetupsDataset, type Puzzle, type Scheme } from "@bld/cube-engine";
import type { M2Data, OpData } from "@/lib/methods";

/**
 * The cases the M2/OP trainer drills, taken from the verified datasets (D-024, D-025), never typed in.
 *
 * - OP corners and OP edges: one case per target sticker: its setup, the swap, the undo.
 * - M2 edges: one case per target sticker. Targets on the M slice's side-effect edges (UF, FU, DB, BD)
 *   have their own alg instead of a setup.
 * - M2 special cases: those four targets in both positions, 8 cases (your 2026-09-15 answer). On an odd
 *   step a special target is shot with another target's alg, which the dataset's odd-step rule names.
 */
export type ShotMode = "op-corners" | "op-edges" | "m2-edges" | "m2-special";

export interface ShotCase {
  readonly id: string;
  readonly mode: ShotMode;
  readonly pieceType: "corners" | "edges";
  readonly target: string;
  readonly letter: string;
  /** Setup moves, or "" when there is none (a target on the swap spot, or an M2 special case). */
  readonly setup: string;
  /** What's written: `[setup: swap]` or the special case's alg. */
  readonly notation: string;
  /** The verified moves, as executed. */
  readonly moves: string;
  /** For M2 special cases. */
  readonly position?: "even" | "odd";
  /** On an odd step: the target whose alg this is. */
  readonly shootAs?: string;
  /** Pieces to light: the buffer, the target, and the swap's other piece or pieces. */
  readonly lit: readonly string[];
}

/** The verified datasets for the reader's OP buffers and M2 buffers (lib/methods.ts). */
export interface MethodDatasets {
  readonly op: OpData;
  readonly m2: M2Data;
}

/**
 * The mode part of a case id. With the standard buffers (D-022) it's the mode alone, as in Phase 4, so
 * existing history keeps its schedules; another buffer adds itself (`op-corners@DBL`), because its setups
 * are different cases and its history must not mix with the standard buffer's.
 */
const STANDARD_BUFFER = { "op-corners": "UBL", "op-edges": "UR", "m2-edges": "DF", "m2-special": "DF" } as const;
export function caseMode(mode: ShotMode, buffer: string): string {
  return buffer === STANDARD_BUFFER[mode] ? mode : `${mode}@${buffer}`;
}

function letterOf(scheme: Scheme, pieceType: "corners" | "edges", sticker: string): string {
  return scheme.letters[pieceType]?.[sticker] ?? "?";
}

function opCases(dataset: OpSetupsDataset, scheme: Scheme, mode: "op-corners" | "op-edges"): ShotCase[] {
  const pieceType = dataset.pieceType;
  return dataset.records.map((record) => {
    const alg = record.algs[0];
    if (alg === undefined) throw new Error(`${dataset.id}: ${record.target} has no alg`);
    return {
      id: `${caseMode(mode, dataset.buffer)}:${record.target}`,
      mode,
      pieceType,
      target: record.target,
      letter: letterOf(scheme, pieceType, record.target),
      setup: record.setup,
      notation: alg.alg,
      moves: alg.moves,
      lit: [dataset.buffer, record.target, dataset.swap.swapSticker, ...dataset.swap.sideEffectPieces],
    };
  });
}

function m2Case(dataset: M2Dataset, scheme: Scheme, target: string, mode: "m2-edges" | "m2-special", position?: "even" | "odd"): ShotCase {
  const shootAs = position === "odd" ? dataset.oddStepRule.find((r) => r.target === target)?.shootAs : undefined;
  const record = dataset.records.find((r) => r.target === (shootAs ?? target));
  if (record === undefined) throw new Error(`m2 dataset has no record for ${shootAs ?? target}`);
  const alg = record.algs[0];
  if (alg === undefined) throw new Error(`m2 dataset: ${record.target} has no alg`);
  return {
    id: position === undefined ? `${caseMode(mode, dataset.buffer)}:${target}` : `${caseMode(mode, dataset.buffer)}:${target}:${position}`,
    mode,
    pieceType: "edges",
    target,
    letter: letterOf(scheme, "edges", target),
    setup: record.kind === "target" ? record.setup : "",
    notation: alg.alg,
    moves: alg.moves,
    ...(position === undefined ? {} : { position }),
    ...(shootAs === undefined ? {} : { shootAs }),
    lit: [dataset.buffer, target, dataset.swap.swapSticker],
  };
}

export function shotCases(mode: ShotMode, datasets: MethodDatasets, scheme: Scheme): ShotCase[] {
  switch (mode) {
    case "op-corners":
      return opCases(datasets.op.corners, scheme, "op-corners");
    case "op-edges":
      return opCases(datasets.op.edges, scheme, "op-edges");
    case "m2-edges":
      return datasets.m2.edges.records.map((r) => m2Case(datasets.m2.edges, scheme, r.target, "m2-edges"));
    case "m2-special":
      return datasets.m2.edges.specialTargets.flatMap((t) => [m2Case(datasets.m2.edges, scheme, t, "m2-special", "even"), m2Case(datasets.m2.edges, scheme, t, "m2-special", "odd")]);
  }
}

/** Case families for drilling a subset: the face the target sticker is on. */
export const FAMILIES = ["U", "F", "R", "D", "L", "B"] as const;
export type Family = (typeof FAMILIES)[number];

export function familyOf(target: string): Family | undefined {
  return FAMILIES.find((f) => target.startsWith(f));
}

export type ScrambleMethod = "op" | "m2";

export interface ScrambleItem {
  readonly kind: "target" | "parity";
  /** The same case id the per-target drills use, so a full scramble feeds the same schedules. */
  readonly caseId: string;
  readonly pieceType?: "corners" | "edges";
  readonly target?: string;
  readonly letter?: string;
  /** 1-based position among this piece type's targets. */
  readonly number?: number;
  /** For M2 special targets. */
  readonly position?: "even" | "odd";
  readonly shotAs?: string;
  readonly setup: string;
  readonly core: string;
  readonly undo: string;
  /** Every move executed before this step, after the scramble. */
  readonly before: string;
  readonly moves: string;
  readonly lit: readonly string[];
}

export interface ScrambleDrill {
  readonly method: ScrambleMethod;
  readonly scramble: string;
  readonly memo: { readonly edges: readonly string[]; readonly corners: readonly string[] };
  readonly items: readonly ScrambleItem[];
  /** The whole solution, as the engine's solver returned it. */
  readonly moves: string;
}

/**
 * A full scramble to drill (BRIEF §7.2), step by step, from the engine's OP/OP or M2/OP solver: edges,
 * then parity when the counts are odd, then corners, with M2's odd/even rule already applied by the
 * solver. Nothing here chooses an alg; it only labels the solver's steps.
 */
export function scrambleDrill(puzzle: Puzzle, scheme: Scheme, method: ScrambleMethod, scramble: string, datasets: MethodDatasets): ScrambleDrill | undefined {
  const solved =
    method === "op"
      ? solveOpOp(puzzle, { alg: scramble }, { scheme, corners: datasets.op.corners, edges: datasets.op.edges, parity: datasets.op.parity })
      : solveM2Op(puzzle, { alg: scramble }, { scheme, corners: datasets.m2.corners, edges: datasets.m2.edges, parity: datasets.m2.parity });
  if (!solved.ok) return undefined;
  const solution = solved.value;
  const items: ScrambleItem[] = [];
  const before: AlgMove[] = [];
  const counts = { corners: 0, edges: 0 };
  for (const step of solution.steps) {
    const moves = stepMoves(step);
    if (step.kind === "target") {
      counts[step.pieceType] += 1;
      const m2 = method === "m2" && step.pieceType === "edges";
      const special = m2 && datasets.m2.edges.specialTargets.includes(step.target);
      const position = step.traceIndex % 2 === 1 ? "odd" : "even";
      const opDataset = step.pieceType === "corners" ? (method === "op" ? datasets.op.corners : datasets.m2.corners) : datasets.op.edges;
      const shotMode: ShotMode = special ? "m2-special" : m2 ? "m2-edges" : step.pieceType === "corners" ? "op-corners" : "op-edges";
      const caseBuffer = m2 ? datasets.m2.edges.buffer : step.pieceType === "corners" ? (method === "op" ? datasets.op.corners.buffer : datasets.m2.corners.buffer) : datasets.op.edges.buffer;
      const caseId = special ? `${caseMode(shotMode, caseBuffer)}:${step.target}:${position}` : `${caseMode(shotMode, caseBuffer)}:${step.target}`;
      items.push({
        kind: "target",
        caseId,
        pieceType: step.pieceType,
        target: step.target,
        letter: solution.traces[step.pieceType].targets[step.traceIndex] ?? letterOf(scheme, step.pieceType, step.target),
        number: counts[step.pieceType],
        ...(special ? { position } : {}),
        ...(step.shotAs === undefined ? {} : { shotAs: step.shotAs }),
        setup: formatMoves(step.setup),
        core: formatMoves(step.core),
        undo: formatMoves(step.undo),
        before: formatMoves(before),
        moves: formatMoves(moves),
        lit: m2 ? [datasets.m2.edges.buffer, step.target, datasets.m2.edges.swap.swapSticker] : [opDataset.buffer, step.target, opDataset.swap.swapSticker, ...opDataset.swap.sideEffectPieces],
      });
    } else if (step.kind === "parity") {
      items.push({
        kind: "parity",
        caseId: `${method === "op" ? "op" : "m2op"}-parity`,
        setup: "",
        core: formatMoves(step.alg),
        undo: "",
        before: formatMoves(before),
        moves: formatMoves(moves),
        lit: [...step.cancels.corners, ...step.cancels.edges, method === "op" ? datasets.op.corners.buffer : datasets.m2.corners.buffer, method === "op" ? datasets.op.edges.buffer : datasets.m2.edges.buffer],
      });
    }
    before.push(...moves);
  }
  return { method, scramble, memo: { edges: solution.traces.edges.targets, corners: solution.traces.corners.targets }, items, moves: formatMoves(solution.moves) };
}
