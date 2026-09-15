import { canonicalSequences, type CommCatalogue } from "../../src/commutator/catalogue.js";
import { cancelMoves, expandNodes } from "../../src/commutator/expand.js";
import { moveCounts } from "../../src/commutator/metrics.js";
import type { AlgMove, AlgNode } from "../../src/commutator/parse.js";
import { threeCyclePattern, validateComm } from "../../src/commutator/validate.js";
import { buildCatalogue, DEFAULT_COMM_BOUNDS } from "../../src/commutator/catalogue.js";
import { searchComms } from "../../src/commutator/search.js";
import { expect } from "vitest";
import { pieceType, type PieceTypeId } from "../../src/pieces/piece-types.js";
import { createRng, shuffled } from "../../src/random/prng.js";
import { composePerms, identityPerm, type StickerPerm } from "../../src/core/move-table.js";
import { faceletsOf, loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { formatAlg } from "../../src/commutator/parse.js";

/**
 * An oracle for the comm search that shares none of its keying (D-031). It files every catalogue comm
 * under its whole sticker permutation, then, for every canonical setup S, asks which comms have exactly
 * the permutation the case needs under S. It returns the best cancelled ETM over those (S, C) pairs.
 */
const permKey = (perm: ArrayLike<number>) => Array.from(perm).join(",");

export function oracle(puzzle: Puzzle, catalogue: CommCatalogue) {
  const table = catalogue.table;
  const permOf = (moves: readonly AlgMove[]) => moves.reduce<StickerPerm>((p, m) => composePerms(p, table.move(m.family, m.amount).perm), identityPerm(table.stickerCount));
  const invert = (moves: readonly AlgMove[]): AlgMove[] => [...moves].reverse().map((m) => ({ type: "move", family: m.family, amount: (4 - m.amount) as 1 | 2 | 3 }));
  const byEffect = new Map<string, { a: readonly AlgMove[]; b: readonly AlgMove[] }[]>();
  for (const key of catalogue.keyList()) {
    for (const comm of catalogue.lookup(key)?.comms ?? []) {
      const effect = permKey(permOf([...comm.a, ...comm.b, ...invert(comm.a), ...invert(comm.b)]));
      const list = byEffect.get(effect) ?? [];
      list.push({ a: comm.a, b: comm.b });
      byEffect.set(effect, list);
    }
  }
  const setups: { moves: AlgMove[]; perm: StickerPerm; inverse: StickerPerm }[] = [];
  canonicalSequences(table, catalogue.bounds.maxSetup, (moves, perm, inverse) => {
    setups.push({ moves: moves.map((m) => ({ type: "move", family: m.family, amount: m.amount })), perm, inverse });
  });

  return (cycle: readonly [string, string, string]) => {
    const state = threeCyclePattern(puzzle, cycle);
    if (!state.ok) throw new Error(JSON.stringify(state.error));
    const required = faceletsOf(puzzle, state.value);
    let best: { etm: number; nodes: AlgNode[] } | undefined;
    for (const setup of setups) {
      // C must satisfy S·C·S⁻¹ = R, so C[S(s)] = S(R[s]) for every sticker s.
      const needed = new Uint8Array(table.stickerCount);
      for (let s = 0; s < table.stickerCount; s++) needed[setup.perm[s] ?? 0] = setup.perm[required[s] ?? 0] ?? 0;
      for (const comm of byEffect.get(permKey(needed)) ?? []) {
        const body: AlgNode = { type: "commutator", a: comm.a, b: comm.b };
        const nodes: AlgNode[] = setup.moves.length === 0 ? [body] : [{ type: "conjugate", setup: setup.moves, body: [body] }];
        const etm = moveCounts(puzzle.id, cancelMoves(puzzle.id, expandNodes(nodes))).etm;
        if (best === undefined || etm < best.etm) best = { etm, nodes };
      }
    }
    return best;
  };
}


export function seededCases(puzzle: Puzzle, typeId: PieceTypeId, buffer: string, count: number): [string, string][] {
  const type = pieceType(puzzle, typeId);
  const b = type.stickerByName(buffer);
  const pairs: [string, string][] = [];
  for (const first of type.stickers) for (const second of type.stickers) if (first.position !== b?.position && second.position !== b?.position && first.position !== second.position) pairs.push([first.name, second.name]);
  return shuffled(createRng(`completeness-${typeId}-${buffer}`), pairs).slice(0, count);
}

export async function expectComplete(typeId: PieceTypeId, buffer: string, count: number | "all"): Promise<void> {
  const puzzle = await loadPuzzle("3x3x3");
  const catalogue = buildCatalogue(puzzle, typeId, DEFAULT_COMM_BOUNDS[typeId === "corners" ? "corners" : "edges"]);
  const best = oracle(puzzle, catalogue);
  const found = searchComms(puzzle, catalogue, { buffer, keep: 1, ...(count === "all" ? {} : { cases: seededCases(puzzle, typeId, buffer, count) }) });
  if (!found.ok) throw new Error(JSON.stringify(found.error));
  for (const c of found.value.cases) {
    const expected = best([buffer, c.targets[0], c.targets[1]]);
    if (expected === undefined) throw new Error(`oracle found nothing for ${c.targets.join("-")}`);
    expect(c.comms[0]?.counts.etm, `${buffer} ${c.targets.join("-")}`).toBe(expected.etm);
    expect(validateComm(puzzle, formatAlg({ puzzle: puzzle.id, nodes: expected.nodes }), [buffer, c.targets[0], c.targets[1]]).ok).toBe(true);
  }
}
