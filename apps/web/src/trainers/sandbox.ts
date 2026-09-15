import { affectedStickers, cancelMoves, expandNodes, formatAlg, formatMoves, moveCounts, parseAlg, pieceType, symmetryImageDataset, validateComm, type AlgDataset, type AlgParseError, type MoveCounts, type Puzzle } from "@bld/cube-engine";

/**
 * The commutator sandbox (BRIEF §7.5): read any alg in bracket notation, expand it with and without
 * cancellation, count its moves, find exactly what it moves, and name the 3-cycle when it is one. The
 * reverse direction finds comms for three stickers from the verified 3-style datasets. Every claim here
 * comes from the engine: "this is a 3-cycle" is only said after `validateComm` confirms it.
 */

export interface AlgAnalysis {
  readonly written: string;
  readonly expanded: string;
  readonly expandedCounts: MoveCounts;
  readonly cancelled: string;
  readonly cancelledCounts: MoveCounts;
  /** Moves removed by cancellation (HTM). */
  readonly saved: number;
  readonly moved: { readonly corners: readonly string[]; readonly edges: readonly string[]; readonly centres: readonly string[] };
  /** Stickers of every moved piece, for lighting them on the cube. */
  readonly movedStickers: readonly string[];
  /** When the alg is exactly a 3-cycle of corners or of edges: the case it solves, as buffer → first → second. */
  readonly threeCycle: { readonly pieceType: "corners" | "edges"; readonly cycle: readonly [string, string, string] } | undefined;
}

export function analyseAlg(puzzle: Puzzle, text: string): { ok: true; analysis: AlgAnalysis } | { ok: false; error: AlgParseError | { readonly code: "empty" } } {
  if (text.trim() === "") return { ok: false, error: { code: "empty" } };
  const parsed = parseAlg(puzzle.id, text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const expandedMoves = expandNodes(parsed.value.nodes);
  const cancelledMoves = cancelMoves(puzzle.id, expandedMoves);
  const expandedCounts = moveCounts(puzzle.id, expandedMoves);
  const cancelledCounts = moveCounts(puzzle.id, cancelledMoves);
  const orbits = affectedStickers(puzzle, parsed.value);
  const piecesOfKind = (kind: string) => orbits.filter((o) => o.kind === kind).flatMap((o) => o.pieces);
  const moved = { corners: piecesOfKind("corner"), edges: piecesOfKind("edge"), centres: piecesOfKind("center") };
  const movedStickers = orbits.flatMap((o) => o.stickers);
  return {
    ok: true,
    analysis: {
      written: formatAlg(parsed.value),
      expanded: formatMoves(expandedMoves),
      expandedCounts,
      cancelled: formatMoves(cancelledMoves),
      cancelledCounts,
      saved: expandedCounts.htm - cancelledCounts.htm,
      moved,
      movedStickers,
      threeCycle: findThreeCycle(puzzle, text, moved, movedStickers),
    },
  };
}

/** Tries each directed cycle of the three moved pieces' stickers; only one the engine validates is reported. */
function findThreeCycle(puzzle: Puzzle, text: string, moved: AlgAnalysis["moved"], movedStickers: readonly string[]): AlgAnalysis["threeCycle"] {
  const kind = moved.corners.length === 3 && moved.edges.length === 0 && moved.centres.length === 0 ? "corners" : moved.edges.length === 3 && moved.corners.length === 0 && moved.centres.length === 0 ? "edges" : undefined;
  if (kind === undefined) return undefined;
  const type = pieceType(puzzle, kind);
  const pieces = moved[kind].map((name) => type.pieceByName(name)?.stickers.map((s) => s.name) ?? []);
  const [first, second, third] = pieces;
  const a = first?.[0];
  if (a === undefined || second === undefined || third === undefined || !movedStickers.includes(a)) return undefined;
  for (const [p, q] of [[second, third], [third, second]] as const)
    for (const b of p)
      for (const c of q) {
        const verdict = validateComm(puzzle, text, [a, b, c]);
        if (verdict.ok && verdict.value.valid) return { pieceType: kind, cycle: [a, b, c] };
      }
  return undefined;
}

const images = new WeakMap<AlgDataset, Map<string, ReturnType<typeof symmetryImageDataset>>>();
function imageFor(puzzle: Puzzle, source: AlgDataset, buffer: string): ReturnType<typeof symmetryImageDataset> {
  let byBuffer = images.get(source);
  if (byBuffer === undefined) {
    byBuffer = new Map();
    images.set(source, byBuffer);
  }
  const hit = byBuffer.get(buffer);
  if (hit !== undefined) return hit;
  const built = symmetryImageDataset(puzzle, source, buffer);
  byBuffer.set(buffer, built);
  return built;
}

export interface CandidateComm {
  readonly alg: string;
  readonly moves: string;
  readonly etm: number;
  /** Which of the three stickers served as the buffer in the dataset it came from. */
  readonly buffer: string;
}

export type CandidateError = "not-three" | "mixed-types" | "same-piece" | "not-corner-or-edge";

/**
 * Comms for the 3-cycle a → b → c (BRIEF §7.5, reverse direction). The same cycle is the case (b, c) from
 * buffer a, (c, a) from b and (a, b) from c, so each rotation's verified dataset contributes its algs. Every
 * candidate is checked against the cycle again, duplicates by cancelled moves are dropped, shortest first.
 */
export function candidateComms(puzzle: Puzzle, sources: { corners: AlgDataset; edges: AlgDataset }, stickers: readonly string[]): { ok: true; comms: CandidateComm[] } | { ok: false; error: CandidateError } {
  if (stickers.length !== 3) return { ok: false, error: "not-three" };
  const [a = "", b = "", c = ""] = stickers;
  const kinds = stickers.map((s) => (pieceType(puzzle, "corners").stickerByName(s) !== undefined ? "corners" : pieceType(puzzle, "edges").stickerByName(s) !== undefined ? "edges" : undefined));
  if (kinds.some((k) => k === undefined)) return { ok: false, error: "not-corner-or-edge" };
  const kind = kinds[0] as "corners" | "edges";
  if (kinds.some((k) => k !== kind)) return { ok: false, error: "mixed-types" };
  const type = pieceType(puzzle, kind);
  const positions = new Set(stickers.map((s) => type.stickerByName(s)?.position));
  if (positions.size !== 3) return { ok: false, error: "same-piece" };

  const found = new Map<string, CandidateComm>();
  for (const [buffer, first, second] of [[a, b, c], [b, c, a], [c, a, b]] as const) {
    const image = imageFor(puzzle, sources[kind], buffer);
    if (!image.ok) continue;
    const record = image.value.records.find((r) => r.id === `${first}-${second}`);
    for (const entry of record?.algs ?? []) {
      const verdict = validateComm(puzzle, entry.alg, [a, b, c]);
      if (!verdict.ok || !verdict.value.valid || found.has(entry.moves)) continue;
      found.set(entry.moves, { alg: entry.alg, moves: entry.moves, etm: entry.etm, buffer });
    }
  }
  return { ok: true, comms: [...found.values()].sort((x, y) => x.etm - y.etm || (x.alg < y.alg ? -1 : 1)) };
}
