import { cubeSymmetries, relabelMove, type CubeSymmetry } from "../core/symmetry.js";
import type { Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { formatAlg, parseAlg, type AlgNode } from "../commutator/parse.js";
import { pieceType } from "../pieces/piece-types.js";
import { buildRecord, entryForAlg, expectedRecordIds, verifyDataset, verifyRecord, type AlgDataset, type AlgEntry, type AlgRecord, type DatasetProblem, type RecordCase } from "./alg-dataset.js";

/**
 * A 3-style dataset for another buffer, as the image of a verified one under a cube symmetry
 * (BRIEF §7.3: "user picks their buffer and the case set regenerates").
 *
 * The comm search's generators (U D R L F B, and M E S for edges) and its bounds are closed under every
 * cube symmetry, and move counts don't change under relabelling, so the image of an exhaustive search
 * for one buffer holds comms exactly as short as a fresh search for the other. Only ties may be broken
 * differently. Every image is rebuilt from its case (ids, intended effects, canonical notation, counts)
 * and then verified in full with `verifyDataset`; a dataset that fails verification is never returned.
 *
 * The symmetry used is the rotation (never a mirror) that carries the source buffer sticker onto the
 * requested one. On 3x3x3 exactly one rotation does, for any corner or edge sticker.
 */

export type SymmetryImageError =
  | { readonly code: "unknown-buffer"; readonly buffer: string }
  | { readonly code: "no-rotation"; readonly from: string; readonly to: string }
  | { readonly code: "invalid-alg"; readonly record: string; readonly alg: string }
  | { readonly code: "no-matching-case"; readonly record: string }
  | { readonly code: "verification-failed"; readonly problems: readonly DatasetProblem[] };

export function relabelNodes(puzzle: Puzzle, symmetry: CubeSymmetry, nodes: readonly AlgNode[]): AlgNode[] {
  return nodes.map((node): AlgNode => {
    switch (node.type) {
      case "move":
        return { type: "move", ...relabelMove(puzzle, symmetry, node) };
      case "commutator":
        return { type: "commutator", a: relabelNodes(puzzle, symmetry, node.a), b: relabelNodes(puzzle, symmetry, node.b) };
      case "conjugate":
        return { type: "conjugate", setup: relabelNodes(puzzle, symmetry, node.setup), body: relabelNodes(puzzle, symmetry, node.body) };
    }
  });
}

/** The rotation carrying one sticker onto another, if there is one. */
export function rotationBetween(puzzle: Puzzle, from: number, to: number): CubeSymmetry | undefined {
  return cubeSymmetries(puzzle).find((g) => !g.mirror && g.sticker[from] === to);
}

export function symmetryImageDataset(puzzle: Puzzle, dataset: AlgDataset, buffer: string): Result<AlgDataset, SymmetryImageError> {
  const type = pieceType(puzzle, dataset.pieceType);
  const source = type.stickerByName(dataset.buffer);
  const target = type.stickerByName(buffer);
  if (source === undefined) return err({ code: "unknown-buffer", buffer: dataset.buffer });
  if (target === undefined) return err({ code: "unknown-buffer", buffer });
  const g = rotationBetween(puzzle, source.index, target.index);
  if (g === undefined) return err({ code: "no-rotation", from: dataset.buffer, to: buffer });

  const byIndex = new Map(type.stickers.map((s) => [s.index, s]));
  const imageSticker = (name: string) => {
    const s = type.stickerByName(name);
    const image = s === undefined ? undefined : byIndex.get(g.sticker[s.index] ?? -1);
    if (image === undefined) throw new Error(`sticker ${name} has no image`);
    return image;
  };
  const imagePiece = (name: string) => {
    const first = type.pieceByName(name)?.stickers[0];
    if (first === undefined) throw new Error(`piece ${name} not found`);
    const image = imageSticker(first.name);
    const piece = type.pieces.find((p) => p.position === image.position);
    if (piece === undefined) throw new Error(`no piece at ${String(image.position)}`);
    return piece.name;
  };

  const id = dataset.id.endsWith(`.${dataset.buffer}`) ? `${dataset.id.slice(0, -dataset.buffer.length)}${buffer}` : `${dataset.id}@${buffer}`;
  const shell: AlgDataset = { ...dataset, id, buffer, generatedBy: { ...dataset.generatedBy, engine: `${dataset.generatedBy.engine} (rotation ${String(g.index)} of ${dataset.id})` }, records: [] };

  const records: AlgRecord[] = [];
  for (const record of dataset.records) {
    const algs: AlgEntry[] = [];
    for (const entry of record.algs) {
      const parsed = parseAlg(puzzle.id, entry.alg);
      if (!parsed.ok) return err({ code: "invalid-alg", record: record.id, alg: entry.alg });
      const text = formatAlg({ puzzle: puzzle.id, nodes: relabelNodes(puzzle, g, parsed.value.nodes) });
      algs.push(entryForAlg(puzzle, text, entry.source, entry.citation));
    }
    // The case is carried by the rotation. A twist's direction is kept, then checked: the verifier
    // decides, never an assumption about how directions relabel.
    const candidates: RecordCase[] =
      record.kind === "cycle"
        ? [{ kind: "cycle", targets: [imageSticker(record.targets[0]).name, imageSticker(record.targets[1]).name] }]
        : record.kind === "twist"
          ? [
              { kind: "twist", target: imagePiece(record.target), direction: record.direction },
              { kind: "twist", target: imagePiece(record.target), direction: record.direction === "clockwise" ? "counterclockwise" : "clockwise" },
            ]
          : [{ kind: "flip", target: imagePiece(record.target) }];
    // With one candidate, the full verification below checks it; only a twist needs choosing here.
    const built = candidates.length === 1 ? candidates.map((c) => buildRecord(puzzle, buffer, c, algs))[0] : candidates.map((c) => buildRecord(puzzle, buffer, c, algs)).find((r) => verifyRecord(puzzle, shell, r).length === 0);
    if (built === undefined) return err({ code: "no-matching-case", record: record.id });
    records.push(built);
  }

  const order = new Map((expectedRecordIds(puzzle, shell) ?? []).map((recordId, i) => [recordId, i]));
  records.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const image: AlgDataset = { ...shell, records };
  const problems = verifyDataset(puzzle, image);
  return problems.length === 0 ? ok(image) : err({ code: "verification-failed", problems });
}
