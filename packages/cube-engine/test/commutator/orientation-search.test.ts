import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { composePerms, identityPerm, moveTable, type TableMove } from "../../src/core/move-table.js";
import { faceletsOf, loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import {
  buildCatalogueOf,
  buildOrientationCatalogue,
  DEFAULT_ORIENTATION_BOUNDS,
  ORIENTATION_PAIR,
  twoGeneratorSequences,
  type CommCatalogue,
} from "../../src/commutator/catalogue.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { formatAlg } from "../../src/commutator/parse.js";
import { searchOrientationAlgs, type OrientationCaseResult } from "../../src/commutator/orientation-search.js";
import { syllableCodec } from "../../src/commutator/syllables.js";
import { orientationPairPattern, validateOrientationAlg } from "../../src/commutator/validate.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { trace } from "../../src/trace/trace.js";

const describeComms = (r: OrientationCaseResult) => r.comms.map((c) => formatAlg(c.alg)).join(" | ");

/** The state traces to exactly the twisted or flipped target plus the buffer; every alg solves it. */
function checkResults(puzzle: Puzzle, typeId: "corners" | "edges", buffer: string, cases: readonly OrientationCaseResult[]): void {
  const scheme = speffzScheme(puzzle);
  const type = pieceType(puzzle, typeId);
  const bufferPiece = type.pieces[type.stickerByName(buffer)?.position ?? -1]?.name;
  for (const result of cases) {
    const orientationCase = { buffer, target: result.target, ...(result.direction === undefined ? {} : { direction: result.direction }) };
    const context = `${buffer} ${result.target} ${result.direction ?? "flip"}`;
    const state = orientationPairPattern(puzzle, orientationCase);
    if (!state.ok) throw new Error(`${context}: ${JSON.stringify(state.error)}`);

    const traced = trace(puzzle, { pattern: state.value }, { pieceType: typeId, buffer, scheme, policy: { orientedInPlace: "separate" } });
    if (!traced.ok) throw new Error(`${context}: ${JSON.stringify(traced.error)}`);
    expect(traced.value.targets, context).toEqual([]);
    const reported = traced.value.orientedInPlace.map((o) => ({ piece: o.piece, direction: o.direction, isBuffer: o.isBuffer }));
    const opposite = result.direction === "clockwise" ? "counterclockwise" : "clockwise";
    expect(reported, context).toEqual([
      { piece: result.target, direction: result.direction ?? "flip", isBuffer: false },
      { piece: bufferPiece, direction: result.direction === undefined ? "flip" : opposite, isBuffer: true },
    ]);

    expect(result.comms.length, context).toBeGreaterThan(0);
    const required = faceletsOf(puzzle, state.value);
    for (const comm of result.comms) {
      const text = formatAlg(comm.alg);
      expect(validateOrientationAlg(puzzle, comm.alg, orientationCase), `${context}: ${text}`).toEqual({ ok: true, value: { valid: true } });
      // Independently: the geometry model's permutation sends each slot's sticker home.
      expect(Array.from(geometryAlgPermutation(puzzle.geometry, formatMoves(comm.moves))), `${context}: ${text} (geometry)`).toEqual(Array.from(required));
    }
  }
}

describe("orientation-pair catalogue", () => {
  it("the two-generator walk finds exactly what a naive walk of every two-family sequence finds (insertion ≤ 3)", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const bounds = { ...DEFAULT_ORIENTATION_BOUNDS.corners, maxInsertion: 3 };
    const catalogue = buildCatalogueOf(puzzle, "corners", bounds, ORIENTATION_PAIR, twoGeneratorSequences);
    const table = moveTable(puzzle, bounds.generators);
    const codec = syllableCodec("3x3x3", bounds.generators);
    const n = table.stickerCount;
    const corner = new Int16Array(n).fill(-1);
    for (const s of pieceType(puzzle, "corners").stickers) corner[s.index] = s.position;

    // Naive: every sequence of 1-3 moves drawn from any two families (repeats allowed), both orders.
    const identities = (cat: CommCatalogue) => {
      const out = new Set<string>();
      for (const key of cat.keyList()) {
        for (const comm of cat.lookup(key)?.comms ?? []) out.add(`${key}|${comm.syllables.axes.join(",")}|${comm.syllables.values.join(",")}`);
      }
      return out;
    };
    const expected = new Set<string>();
    const inverse = (moves: readonly TableMove[]) => [...moves].reverse().map((m) => table.moves[m.inverseIndex] ?? m);
    // Unordered family pairs (a pair with itself included): both orders draw from the same moves.
    table.families.forEach((f, fi) => {
      for (const g of table.families.slice(fi)) {
        const pool = table.moves.filter((m) => m.family === f || m.family === g);
        const sequences: TableMove[][] = pool.map((m) => [m]);
        for (let length = 2; length <= 3; length++) {
          for (const sequence of sequences.filter((s) => s.length === length - 1)) for (const m of pool) sequences.push([...sequence, m]);
        }
        for (const x of sequences) {
          for (const i of table.moves) {
            for (const [a, b] of [[x, [i]], [[i], x]] as const) {
              const full = [...a, ...b, ...inverse(a), ...inverse(b)];
              const perm = full.reduce((p, m) => composePerms(p, m.perm), identityPerm(n));
              const moved = [...perm.keys()].filter((s) => perm[s] !== s);
              if (moved.length !== 6 || moved.some((s) => corner[s] === -1 || corner[perm[s] ?? 0] !== corner[s])) continue;
              const key = ORIENTATION_PAIR.classify(perm, moved, corner, n);
              if (key === undefined) continue;
              const syllables = codec.encode(full);
              expected.add(`${key}|${syllables.axes.join(",")}|${syllables.values.join(",")}`);
            }
          }
        }
      }
    });
    expect(identities(catalogue)).toEqual(expected);
  });
});

describe("twist and flip search", () => {
  it("UFR corners: all 14 twist cases have algs that solve exactly the traced state; pruning changes nothing", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const catalogue = buildOrientationCatalogue(puzzle, "corners", DEFAULT_ORIENTATION_BOUNDS.corners);
    const pruned = searchOrientationAlgs(puzzle, catalogue, { buffer: "UFR" });
    const brute = searchOrientationAlgs(puzzle, catalogue, { buffer: "UFR", prune: false });
    if (!pruned.ok || !brute.ok) throw new Error("search failed");
    expect(pruned.value.cases).toHaveLength(14);
    expect(pruned.value.noAlg).toEqual([]);
    expect(pruned.value.cases.map(describeComms)).toEqual(brute.value.cases.map(describeComms));
    checkResults(puzzle, "corners", "UFR", pruned.value.cases);

    // Another buffer, sampled: DBL, two pieces.
    const other = searchOrientationAlgs(puzzle, catalogue, {
      buffer: "DBL",
      cases: [
        { buffer: "DBL", target: "UFR", direction: "clockwise" },
        { buffer: "DBL", target: "DFL", direction: "counterclockwise" },
      ],
    });
    if (!other.ok) throw new Error("search failed");
    checkResults(puzzle, "corners", "DBL", other.value.cases);
  });

  it("UF edges: all 11 flip cases have algs that solve exactly the traced state; FR sampled; pruning changes nothing (setups ≤ 1)", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const catalogue = buildOrientationCatalogue(puzzle, "edges", DEFAULT_ORIENTATION_BOUNDS.edges);
    const result = searchOrientationAlgs(puzzle, catalogue, { buffer: "UF" });
    if (!result.ok) throw new Error("search failed");
    expect(result.value.cases).toHaveLength(11);
    expect(result.value.noAlg).toEqual([]);
    checkResults(puzzle, "edges", "UF", result.value.cases);

    const other = searchOrientationAlgs(puzzle, catalogue, { buffer: "FR", cases: [{ buffer: "FR", target: "UF" }, { buffer: "FR", target: "DB" }] });
    if (!other.ok) throw new Error("search failed");
    checkResults(puzzle, "edges", "FR", other.value.cases);

    // The unpruned search over the full edge catalogue is too slow for this suite, so compare with short
    // setups. The catalogue's contents don't depend on the setup bound, so the same one is reused.
    const small: CommCatalogue = { ...catalogue, bounds: { ...catalogue.bounds, maxSetup: 1 } };
    const pruned = searchOrientationAlgs(puzzle, small, { buffer: "UF" });
    const brute = searchOrientationAlgs(puzzle, small, { buffer: "UF", prune: false });
    if (!pruned.ok || !brute.ok) throw new Error("search failed");
    expect(pruned.value.cases.map(describeComms)).toEqual(brute.value.cases.map(describeComms));
  });

  it("reports bad cases as typed errors", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const code = (r: ReturnType<typeof orientationPairPattern>) => (r.ok ? "ok" : r.error.code);
    expect(code(orientationPairPattern(puzzle, { buffer: "XYZ", target: "UBL", direction: "clockwise" }))).toBe("unknown-sticker");
    expect(code(orientationPairPattern(puzzle, { buffer: "UFR", target: "UF", direction: "clockwise" }))).toBe("unknown-piece");
    expect(code(orientationPairPattern(puzzle, { buffer: "UFR", target: "UFR", direction: "clockwise" }))).toBe("same-piece");
    expect(code(orientationPairPattern(puzzle, { buffer: "UFR", target: "UBL" }))).toBe("direction-required");
    expect(code(orientationPairPattern(puzzle, { buffer: "UF", target: "UB", direction: "clockwise" }))).toBe("direction-not-applicable");
    const four = await loadPuzzle("4x4x4");
    expect(code(orientationPairPattern(four, { buffer: "UFr", target: "UBl" }))).toBe("no-orientation");
  });
});
