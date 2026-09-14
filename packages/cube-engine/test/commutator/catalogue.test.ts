import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { composePerms, identityPerm, moveTable, type StickerPerm, type TableMove } from "../../src/core/move-table.js";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { buildCatalogue, cycleKey, DEFAULT_COMM_BOUNDS, syllableSignature, type CommCatalogue } from "../../src/commutator/catalogue.js";
import { cancelMoves, formatMoves } from "../../src/commutator/expand.js";
import { formatNodes } from "../../src/commutator/parse.js";
import { syllableCodec } from "../../src/commutator/syllables.js";
import { pieceType } from "../../src/pieces/piece-types.js";

function allKeys(catalogue: CommCatalogue, n: number): number[] {
  const keys: number[] = [];
  for (let k = 0; k < n * n * n; k++) if (catalogue.lookup(k) !== undefined) keys.push(k);
  return keys;
}

describe("comm catalogue", () => {
  it.each(["corners", "edges"] as const)("%s: canonical enumeration finds exactly what a naive enumeration of every sequence finds (insertion ≤ 2)", async (typeId) => {
    const puzzle = await loadPuzzle("3x3x3");
    const bounds = { ...DEFAULT_COMM_BOUNDS[typeId], maxInsertion: 2 };
    const catalogue = buildCatalogue(puzzle, typeId, bounds);
    const table = moveTable(puzzle, bounds.generators);
    const codec = syllableCodec("3x3x3", bounds.generators);
    const n = table.stickerCount;
    const inType = new Set(pieceType(puzzle, typeId).stickers.map((s) => s.index));

    // Naive: every sequence (no canonical form), every interchange, both orders; effect read from full permutations.
    const expected = new Map<number, Set<string>>();
    const sequences: TableMove[][] = table.moves.map((m) => [m]);
    for (const m of table.moves) for (const k of table.moves) sequences.push([m, k]);
    const permOf = (moves: readonly TableMove[]): StickerPerm => moves.reduce((p, m) => composePerms(p, m.perm), identityPerm(n));
    const inverse = (moves: readonly TableMove[]) => [...moves].reverse().map((m) => table.moves[m.inverseIndex] ?? m);
    for (const x of sequences) {
      for (const i of table.moves) {
        for (const [a, b] of [[x, [i]], [[i], x]] as const) {
          const full = [...a, ...b, ...inverse(a), ...inverse(b)];
          const perm = permOf(full);
          const moved = [...perm.keys()].filter((s) => perm[s] !== s);
          const pieces = new Set(moved.map((s) => pieceType(puzzle, typeId).stickers.find((t) => t.index === s)?.position));
          if (moved.length !== 3 * (typeId === "corners" ? 3 : 2) || moved.some((s) => !inType.has(s)) || pieces.size !== 3) continue;
          const s0 = moved[0] ?? -1;
          const p1 = perm[s0] ?? -1;
          const p2 = perm[p1] ?? -1;
          if (moved.some((s) => perm[perm[perm[s] ?? -1] ?? -1] !== s)) continue;
          const key = cycleKey(n, s0, p1, p2);
          const syllables = codec.encode(full);
          const identity = `${syllables.axes.join(",")}|${syllables.values.join(",")}`;
          expected.set(key, new Set([...(expected.get(key) ?? []), identity]));
        }
      }
    }
    const actual = new Map(
      allKeys(catalogue, n).map((k) => [k, new Set((catalogue.lookup(k)?.comms ?? []).map((c) => `${c.syllables.axes.join(",")}|${c.syllables.values.join(",")}`))]),
    );
    expect(actual.size).toBe(expected.size);
    for (const [key, identities] of expected) expect(actual.get(key), `key ${key}`).toEqual(identities);
  });

  it.each(["corners", "edges"] as const)("%s at the default bounds: lists are ordered and indexed, and sampled comms have exactly their key's effect", async (typeId) => {
    const puzzle = await loadPuzzle("3x3x3");
    const catalogue = buildCatalogue(puzzle, typeId, DEFAULT_COMM_BOUNDS[typeId]);
    const n = catalogue.table.stickerCount;
    // Sizes at the D-019 bounds, pinned so an accidental change to the search space shows up here.
    expect({ size: catalogue.size, keys: catalogue.keys }).toEqual(typeId === "corners" ? { size: 4608, keys: 528 } : { size: 100512, keys: 1320 });
    expect(catalogue.keyList()).toEqual(allKeys(catalogue, n));

    let sampled = 0;
    let count = 0;
    const problems: string[] = [];
    for (const key of allKeys(catalogue, n)) {
      const list = catalogue.lookup(key);
      if (list === undefined) continue;
      const firstIndex = new Map([...list.byFirst].map(([signature, comms]) => [signature, new Set(comms)]));
      const lastIndex = new Map([...list.byLast].map(([signature, comms]) => [signature, new Set(comms)]));
      const indexed = [...firstIndex.values()].reduce((sum, set) => sum + set.size, 0);
      if (indexed !== list.comms.length) problems.push(`key ${key}: first-syllable index has ${indexed} of ${list.comms.length}`);
      list.comms.forEach((comm, i) => {
        const next = list.comms[i + 1];
        if (comm.rank !== i || (next !== undefined && comm.length > next.length)) problems.push(`key ${key}: list out of order at ${i}`);
        const { axes, values } = comm.syllables;
        if (firstIndex.get(syllableSignature(axes[0] ?? -1, values[0] ?? 0))?.has(comm) !== true) problems.push(`key ${key}: comm ${i} not under its first syllable`);
        if (lastIndex.get(syllableSignature(axes[axes.length - 1] ?? -1, values[values.length - 1] ?? 0))?.has(comm) !== true) {
          problems.push(`key ${key}: comm ${i} not under its last syllable`);
        }

        if (count++ % 211 !== 0) return;
        sampled++;
        const nodes = [{ type: "commutator" as const, a: comm.a, b: comm.b }];
        const text = formatNodes(nodes);
        const expanded = [...comm.a, ...comm.b, ...[...comm.a].reverse().map((m) => ({ ...m, amount: (4 - m.amount) as 1 | 2 | 3 })), ...[...comm.b].reverse().map((m) => ({ ...m, amount: (4 - m.amount) as 1 | 2 | 3 }))];
        expect(comm.length, text).toBe(cancelMoves("3x3x3", expanded).length);
        const perm = geometryAlgPermutation(puzzle.geometry, formatMoves(expanded));
        const a = Math.floor(key / (n * n));
        const b = Math.floor(key / n) % n;
        const c = key % n;
        // The key's sticker cycle, plus the other stickers of the same three pieces, and nothing else.
        expect([perm[a], perm[b], perm[c]], text).toEqual([b, c, a]);
        const type = pieceType(puzzle, typeId);
        const pieceOf = (s: number) => type.stickers.find((t) => t.index === s)?.position;
        const moved = [...perm.keys()].filter((s) => perm[s] !== s);
        expect(new Set(moved.map(pieceOf)), text).toEqual(new Set([a, b, c].map(pieceOf)));
        expect(moved.length, text).toBe(3 * (type.pieces[0]?.stickers.length ?? 0));
        expect(moved.every((s) => perm[perm[perm[s] ?? -1] ?? -1] === s), text).toBe(true);
      });
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(sampled).toBeGreaterThan(20);
  });
});
