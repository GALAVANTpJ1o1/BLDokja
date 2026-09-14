import { at } from "../core/arrays.js";
import type { StickerPerm, TableMove } from "../core/move-table.js";
import type { Puzzle } from "../core/puzzle.js";
import { canonicalSequences, syllableSignature, toAlgMove, type CatalogueComm, type CommCatalogue } from "./catalogue.js";
import { cancelMoves, expandNodes } from "./expand.js";
import { moveCounts, type MoveCounts } from "./metrics.js";
import type { AlgMove, AlgNode, ParsedAlg } from "./parse.js";
import type { Syllables } from "./syllables.js";

/**
 * The search shared by every kind of catalogue (DECISIONS D-019): for each case, find the best
 * [S: C] with S a canonical setup of up to `maxSetup` moves and C a catalogue comm whose effect,
 * mapped through S, is exactly the case's effect.
 *
 * A case only has to say which catalogue key its effect has after a setup permutation; everything
 * else (setups, the exact pruning, ranking and deduplication) is the same whether the catalogue
 * holds 3-cycles or orientation pairs.
 *
 * Candidates are ranked by cancelled ETM, then QTM, then setup length, then the written moves in
 * generator order. The best `keep` distinct cancelled sequences are kept per case.
 *
 * Pruning is exact. With θ the case's current `keep`-th best ETM and σ the setup's last syllable:
 * unless C's first syllable is σ⁻¹ or its last syllable is σ, the two junctions of S·C·S⁻¹ can't
 * cascade, each loses at most 2|σ| moves, and so |S C S⁻¹| ≥ 2|S| + |C| − 4|σ|. Each key's comms
 * are sorted by |C|, so the scan stops once that bound passes θ; the comms whose first or last
 * syllable could cascade are fetched from an index and always evaluated. Setups run shortest first
 * so θ falls early. Only candidates provably worse than θ are skipped, and tests compare the result
 * with the unpruned search.
 */

export interface FoundComm {
  /** `[A, B]`, or `[S: [A, B]]` with a setup. */
  readonly alg: ParsedAlg;
  /** Expanded and cancelled (D-017). */
  readonly moves: readonly AlgMove[];
  readonly counts: MoveCounts;
  readonly setupLength: number;
}

export interface CommSearchStats {
  readonly setups: number;
  /** (setup, case) pairs whose image effect has comms. */
  readonly lookups: number;
  readonly exactEvaluations: number;
}

export interface ConjugateCase {
  /** Catalogue key of this case's effect, carried through the setup permutation `perm`. */
  keyUnder(perm: StickerPerm): number;
}

export interface ConjugateSearchOptions {
  readonly keep: number;
  readonly prune: boolean;
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

/** The best `keep` comms for each case, best first, plus deterministic work counts. */
export function searchConjugates(
  puzzle: Puzzle,
  catalogue: CommCatalogue,
  cases: readonly ConjugateCase[],
  options: ConjugateSearchOptions,
): { readonly comms: readonly (readonly FoundComm[])[]; readonly stats: CommSearchStats } {
  const { keep, prune } = options;
  const { codec } = catalogue;
  const setups = setupsFor(catalogue);
  const tops: Candidate[][] = cases.map(() => []);
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

  for (const setup of setups) {
    const base = 2 * setup.moves.length - 4 * setup.tailCount;
    const firstCascade = setup.tailCount === 0 ? -1 : syllableSignature(setup.tailAxis, codec.negate(setup.tailValue));
    const lastCascade = setup.tailCount === 0 ? -1 : syllableSignature(setup.tailAxis, setup.tailValue);
    for (let c = 0; c < cases.length; c++) {
      const list = catalogue.lookup(at(cases, c).keyUnder(setup.perm));
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

  const comms = tops.map((top, c) =>
    top.map((candidate): FoundComm => {
      const comm: AlgNode = { type: "commutator", a: candidate.comm.a, b: candidate.comm.b };
      const nodes: AlgNode[] = candidate.setup.moves.length === 0 ? [comm] : [{ type: "conjugate", setup: candidate.setup.moves.map(toAlgMove), body: [comm] }];
      const moves = cancelMoves(puzzle.id, expandNodes(nodes));
      const counts = moveCounts(puzzle.id, moves);
      if (counts.etm !== candidate.etm || counts.qtm !== candidate.qtm) throw new Error(`packed and exact costs disagree for case ${c}`);
      return { alg: { puzzle: puzzle.id, nodes }, moves, counts, setupLength: candidate.setup.moves.length };
    }),
  );
  return { comms, stats: { setups: setups.length, lookups, exactEvaluations } };
}
