import type { M2Dataset, OpSetupsDataset, Scheme } from "@bld/cube-engine";

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

export interface ShotDatasets {
  readonly opCorners: OpSetupsDataset;
  readonly opEdges: OpSetupsDataset;
  readonly m2Edges: M2Dataset;
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
      id: `${mode}:${record.target}`,
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
    id: position === undefined ? `${mode}:${target}` : `${mode}:${target}:${position}`,
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

export function shotCases(mode: ShotMode, datasets: ShotDatasets, scheme: Scheme): ShotCase[] {
  switch (mode) {
    case "op-corners":
      return opCases(datasets.opCorners, scheme, "op-corners");
    case "op-edges":
      return opCases(datasets.opEdges, scheme, "op-edges");
    case "m2-edges":
      return datasets.m2Edges.records.map((r) => m2Case(datasets.m2Edges, scheme, r.target, "m2-edges"));
    case "m2-special":
      return datasets.m2Edges.specialTargets.flatMap((t) => [m2Case(datasets.m2Edges, scheme, t, "m2-special", "even"), m2Case(datasets.m2Edges, scheme, t, "m2-special", "odd")]);
  }
}
