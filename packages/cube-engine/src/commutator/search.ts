import { at } from "../core/arrays.js";
import type { StickerPerm, TableMove } from "../core/move-table.js";
import type { Puzzle, PuzzleId } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { pieceType, type PieceTypeId } from "../pieces/piece-types.js";
import { canonicalSequences, cycleKey, syllableSignature, toAlgMove, type CatalogueComm, type CommCatalogue, type CommSearchBounds } from "./catalogue.js";
import { cancelMoves, expandNodes } from "./expand.js";
import { moveCounts, type MoveCounts } from "./metrics.js";
import type { AlgMove, AlgNode, ParsedAlg } from "./parse.js";
import type { Syllables } from "./syllables.js";

/**
 * 3-style comm search for one buffer (DECISIONS D-019).
 *
 * For a case (t1, t2), a candidate is [S: C]: a canonical setup S of up to `maxSetup` moves and a
 * catalogue comm C whose 3-cycle is the image of buffer → t1 → t2 under S. Conjugating C by S maps
 * that cycle back onto the case, so every candidate solves it exactly.
 *
 * Candidates are ranked by cancelled ETM, then QTM, then setup length, then the written moves in
 * generator order. The best `keep` distinct cancelled sequences are kept per case.
 *
 * Pruning is exact. With θ the case's current `keep`-th best ETM and σ the setup's last syllable:
 * unless C's first syllable is σ⁻¹ or its last syllable is σ, the two junctions of S·C·S⁻¹ can't
 * cascade, each loses at most 2|σ| moves, and so |S C S⁻¹| ≥ 2|S| + |C| − 4|σ|. Each cycle's comms
 * are sorted by |C|, so the scan stops once that bound passes θ; the comms whose first or last
 * syllable could cascade are fetched from an index and always evaluated. Setups run shortest first
 * so θ falls early. Only candidates provably worse than θ are skipped, and tests compare the
 * result with the unpruned search.
 */

export interface FoundComm {
  /** `[A, B]`, or `[S: [A, B]]` with a setup. */
  readonly alg: ParsedAlg;
  /** Expanded and cancelled (D-017). */
  readonly moves: readonly AlgMove[];
  readonly counts: MoveCounts;
  readonly setupLength: number;
}

export interface CommCaseResult {
  readonly targets: readonly [string, string];
  /** Best first. Empty when the bounds hold no comm for the case. */
  readonly comms: readonly FoundComm[];
}

export interface CommSearchStats {
  readonly setups: number;
  /** (setup, case) pairs whose image cycle has comms. */
  readonly lookups: number;
  readonly exactEvaluations: number;
}

export interface CommSearchResult {
  readonly puzzle: PuzzleId;
  readonly pieceType: PieceTypeId;
  readonly buffer: string;
  readonly bounds: CommSearchBounds;
  readonly cases: readonly CommCaseResult[];
  readonly noComm: readonly (readonly [string, string])[];
  readonly stats: CommSearchStats;
}

export type CommSearchError =
  | { readonly code: "catalogue-puzzle-mismatch"; readonly expected: PuzzleId; readonly actual: PuzzleId }
  | { readonly code: "unknown-sticker"; readonly sticker: string }
  | { readonly code: "same-piece"; readonly stickers: readonly [string, string] };

export interface CommSearchOptions {
  /** Buffer sticker, of the catalogue's piece type. */
  readonly buffer: string;
  /** Ordered target pairs. Default: every pair on two distinct non-buffer pieces. */
  readonly cases?: readonly (readonly [string, string])[];
  /** Distinct comms kept per case, best first. Default 4: the best and three alternates. */
  readonly keep?: number;
  /** `false` evaluates every candidate. It exists so tests can check that pruning changes nothing. */
  readonly prune?: boolean;
}

interface Setup {
  readonly moves: readonly TableMove[];
  readonly written: readonly number[];
  readonly perm: StickerPerm;
  readonly syllables: Syllables;
  readonly tailAxis: number;
  readonly tailValue: number;
  readonly tailCount: number;
}

interface Candidate {
  readonly etm: number;
  readonly qtm: number;
  readonly setup: Setup;
  readonly comm: CatalogueComm;
  readonly identity: string;
}

const setupCache = new WeakMap<CommCatalogue, readonly Setup[]>();

/** Canonical setups up to the catalogue's bound, shortest first (stable within a length). */
function setupsFor(catalogue: CommCatalogue): readonly Setup[] {
  const cached = setupCache.get(catalogue);
  if (cached !== undefined) return cached;
  const { codec, table } = catalogue;
  const setups: Setup[] = [];
  canonicalSequences(table, catalogue.bounds.maxSetup, (moves, perm) => {
    const syllables = codec.encode(moves);
    const last = syllables.axes.length - 1;
    const tailValue = last < 0 ? 0 : at(syllables.values, last);
    setups.push({
      moves: [...moves],
      written: moves.map((m) => m.index),
      perm,
      syllables,
      tailAxis: last < 0 ? -1 : at(syllables.axes, last),
      tailValue,
      tailCount: last < 0 ? 0 : codec.moveCount(tailValue),
    });
  });
  const ordered = setups.map((s, i) => ({ s, i })).sort((p, q) => p.s.moves.length - q.s.moves.length || p.i - q.i).map(({ s }) => s);
  setupCache.set(catalogue, ordered);
  return ordered;
}

function compareWritten(a: Candidate, b: Candidate): number {
  const left = [...a.setup.written, ...a.comm.writtenKey];
  const right = [...b.setup.written, ...b.comm.writtenKey];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const d = at(left, i) - at(right, i);
    if (d !== 0) return d;
  }
  return left.length - right.length;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  return a.etm - b.etm || a.qtm - b.qtm || a.setup.moves.length - b.setup.moves.length || compareWritten(a, b);
}

export function searchComms(puzzle: Puzzle, catalogue: CommCatalogue, options: CommSearchOptions): Result<CommSearchResult, CommSearchError> {
  if (catalogue.puzzleId !== puzzle.id) return err({ code: "catalogue-puzzle-mismatch", expected: puzzle.id, actual: catalogue.puzzleId });
  const type = pieceType(puzzle, catalogue.pieceType);
  const buffer = type.stickerByName(options.buffer);
  if (buffer === undefined) return err({ code: "unknown-sticker", sticker: options.buffer });

  const pairs: (readonly [string, string])[] = [];
  if (options.cases === undefined) {
    for (const first of type.stickers) {
      if (first.position === buffer.position) continue;
      for (const second of type.stickers) {
        if (second.position !== buffer.position && second.position !== first.position) pairs.push([first.name, second.name]);
      }
    }
  } else {
    pairs.push(...options.cases);
  }
  const firstTargets: number[] = [];
  const secondTargets: number[] = [];
  for (const [firstName, secondName] of pairs) {
    const first = type.stickerByName(firstName);
    const second = type.stickerByName(secondName);
    if (first === undefined) return err({ code: "unknown-sticker", sticker: firstName });
    if (second === undefined) return err({ code: "unknown-sticker", sticker: secondName });
    if (first.position === buffer.position) return err({ code: "same-piece", stickers: [options.buffer, firstName] });
    if (second.position === buffer.position) return err({ code: "same-piece", stickers: [options.buffer, secondName] });
    if (first.position === second.position) return err({ code: "same-piece", stickers: [firstName, secondName] });
    firstTargets.push(first.index);
    secondTargets.push(second.index);
  }

  const keep = options.keep ?? 4;
  const prune = options.prune ?? true;
  const { codec } = catalogue;
  const n = catalogue.table.stickerCount;
  const setups = setupsFor(catalogue);
  const tops: Candidate[][] = pairs.map(() => []);
  let lookups = 0;
  let exactEvaluations = 0;

  // Offer the candidate whose cancelled length `etm` the codec has just computed.
  const offer = (top: Candidate[], setup: Setup, comm: CatalogueComm, etm: number) => {
    const worst = top.length === keep ? top[keep - 1] : undefined;
    if (worst !== undefined && etm > worst.etm) return;
    const qtm = codec.lastQuarterTurns();
    if (worst !== undefined && etm === worst.etm && (qtm > worst.qtm || (qtm === worst.qtm && setup.moves.length > worst.setup.moves.length))) return;
    const candidate: Candidate = { etm, qtm, setup, comm, identity: codec.lastIdentity() };
    const duplicate = top.findIndex((c) => c.identity === candidate.identity);
    if (duplicate >= 0) {
      if (compareCandidates(candidate, at(top, duplicate)) < 0) {
        top[duplicate] = candidate;
        top.sort(compareCandidates);
      }
      return;
    }
    if (worst !== undefined && compareCandidates(candidate, worst) >= 0) return;
    top.push(candidate);
    top.sort(compareCandidates);
    if (top.length > keep) top.pop();
  };

  const evaluate = (top: Candidate[], setup: Setup, comm: CatalogueComm) => {
    exactEvaluations++;
    offer(top, setup, comm, codec.conjugateLength(setup.syllables, comm.syllables));
  };

  const bufferIndex = buffer.index;
  for (const setup of setups) {
    const perm = setup.perm;
    const bufferImage = perm[bufferIndex] ?? 0;
    const base = 2 * setup.moves.length - 4 * setup.tailCount;
    const firstCascade = setup.tailCount === 0 ? -1 : syllableSignature(setup.tailAxis, codec.negate(setup.tailValue));
    const lastCascade = setup.tailCount === 0 ? -1 : syllableSignature(setup.tailAxis, setup.tailValue);
    for (let c = 0; c < pairs.length; c++) {
      const list = catalogue.lookup(cycleKey(n, bufferImage, perm[firstTargets[c] ?? 0] ?? 0, perm[secondTargets[c] ?? 0] ?? 0));
      if (list === undefined) continue;
      lookups++;
      const top = at(tops, c);
      const comms = list.comms;
      if (!prune) {
        for (const comm of comms) evaluate(top, setup, comm);
        continue;
      }
      let scanned = 0;
      for (; scanned < comms.length; scanned++) {
        const theta = top.length === keep ? at(top, keep - 1).etm : Number.POSITIVE_INFINITY;
        const comm = at(comms, scanned);
        if (base + comm.length > theta) break;
        evaluate(top, setup, comm);
      }
      if (setup.tailCount > 0 && scanned < comms.length) {
        for (const comm of list.byFirst.get(firstCascade) ?? []) if (comm.rank >= scanned) evaluate(top, setup, comm);
        for (const comm of list.byLast.get(lastCascade) ?? []) if (comm.rank >= scanned) evaluate(top, setup, comm);
      }
    }
  }

  const cases = pairs.map((targets, c): CommCaseResult => ({
    targets,
    comms: at(tops, c).map((candidate): FoundComm => {
      const comm: AlgNode = { type: "commutator", a: candidate.comm.a, b: candidate.comm.b };
      const nodes: AlgNode[] = candidate.setup.moves.length === 0 ? [comm] : [{ type: "conjugate", setup: candidate.setup.moves.map(toAlgMove), body: [comm] }];
      const moves = cancelMoves(puzzle.id, expandNodes(nodes));
      const counts = moveCounts(puzzle.id, moves);
      if (counts.etm !== candidate.etm || counts.qtm !== candidate.qtm) {
        throw new Error(`packed and exact costs disagree for case ${targets.join(" ")}`);
      }
      return { alg: { puzzle: puzzle.id, nodes }, moves, counts, setupLength: candidate.setup.moves.length };
    }),
  }));

  return ok({
    puzzle: puzzle.id,
    pieceType: catalogue.pieceType,
    buffer: buffer.name,
    bounds: catalogue.bounds,
    cases,
    noComm: cases.filter((r) => r.comms.length === 0).map((r) => r.targets),
    stats: { setups: setups.length, lookups, exactEvaluations },
  });
}
