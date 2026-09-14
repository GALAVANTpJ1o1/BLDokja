import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { buildCatalogue, DEFAULT_COMM_BOUNDS, type CommCatalogue } from "../../src/commutator/catalogue.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { formatAlg } from "../../src/commutator/parse.js";
import { searchComms, type CommCaseResult } from "../../src/commutator/search.js";
import { validateComm } from "../../src/commutator/validate.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { createRng, shuffled } from "../../src/random/prng.js";

/**
 * Sampled buffers for the fast suite (DECISIONS D-019). The full case sets are in the slow suite and
 * the buffer-comparison report.
 */
const SAMPLES = [
  { type: "corners" as const, buffers: ["UFR", "UBL", "DBR"] },
  { type: "edges" as const, buffers: ["UF", "DF", "FR"] },
];
const CASES_PER_BUFFER = 20;

function allPairs(puzzle: Puzzle, typeId: "corners" | "edges", buffer: string): [string, string][] {
  const type = pieceType(puzzle, typeId);
  const b = type.stickerByName(buffer)?.position;
  const pairs: [string, string][] = [];
  for (const first of type.stickers) {
    if (first.position === b) continue;
    for (const second of type.stickers) if (second.position !== b && second.position !== first.position) pairs.push([first.name, second.name]);
  }
  return pairs;
}

const describeComms = (r: CommCaseResult) => r.comms.map((c) => formatAlg(c.alg)).join(" | ");

function checkCase(puzzle: Puzzle, buffer: string, result: CommCaseResult): void {
  const [first, second] = result.targets;
  const context = `${buffer} ${first} ${second}`;
  const identities = new Set<string>();
  result.comms.forEach((comm, i) => {
    const text = formatAlg(comm.alg);
    // Solves the case, judged by kpuzzle (validateComm) and by the independent geometry model.
    expect(validateComm(puzzle, comm.alg, [buffer, first, second]), `${context}: ${text}`).toEqual({ ok: true, value: { valid: true } });
    const perm = geometryAlgPermutation(puzzle.geometry, formatMoves(comm.moves));
    const index = (name: string) => puzzle.geometry.stickers.findIndex((s) => pieceType(puzzle, puzzle.geometry.cubieOf(s.index).stickers.length === 3 ? "corners" : "edges").stickerByName(name)?.index === s.index);
    const [b, t1, t2] = [index(buffer), index(first), index(second)];
    expect([perm[b], perm[t1], perm[t2]], `${context}: ${text} (geometry)`).toEqual([t1, t2, b]);
    // Ranked, and distinct as cancelled sequences.
    const previous = result.comms[i - 1];
    if (previous !== undefined) {
      const order = Math.sign(comm.counts.etm - previous.counts.etm) || Math.sign(comm.counts.qtm - previous.counts.qtm) || Math.sign(comm.setupLength - previous.setupLength);
      expect(order, `${context}: ranking`).toBeGreaterThanOrEqual(0);
    }
    identities.add(formatMoves(comm.moves));
  });
  expect(identities.size, `${context}: distinct`).toBe(result.comms.length);
}

describe.each(SAMPLES)("comm search, sampled $type buffers", ({ type, buffers }) => {
  let catalogue: CommCatalogue | undefined;
  const catalogueFor = (puzzle: Puzzle) => (catalogue ??= buildCatalogue(puzzle, type, DEFAULT_COMM_BOUNDS[type]));

  it.each(buffers)(`buffer %s: ${CASES_PER_BUFFER} seeded cases; pruning changes nothing, and every comm solves its case`, async (buffer) => {
    const puzzle = await loadPuzzle("3x3x3");
    const cat = catalogueFor(puzzle);
    const cases = shuffled(createRng(`comm-search-${buffer}`), allPairs(puzzle, type, buffer)).slice(0, CASES_PER_BUFFER);

    const pruned = searchComms(puzzle, cat, { buffer, cases });
    const brute = searchComms(puzzle, cat, { buffer, cases, prune: false });
    if (!pruned.ok || !brute.ok) throw new Error("search failed");
    expect(pruned.value.stats.exactEvaluations).toBeLessThan(brute.value.stats.exactEvaluations);

    pruned.value.cases.forEach((result, i) => {
      const unpruned = brute.value.cases[i];
      if (unpruned === undefined) throw new Error("case missing");
      expect(describeComms(result), result.targets.join(" ")).toBe(describeComms(unpruned));
      expect(result.comms.length, result.targets.join(" ")).toBe(4);
      checkCase(puzzle, buffer, result);
    });
    expect(pruned.value.noComm).toEqual([]);
  });
});

describe("comm search contract", () => {
  it("gives the same comms for a case whether it is searched alone or with all others", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const catalogue = buildCatalogue(puzzle, "corners", DEFAULT_COMM_BOUNDS.corners);
    const all = searchComms(puzzle, catalogue, { buffer: "UFR" });
    if (!all.ok) throw new Error("search failed");
    expect(all.value.cases).toHaveLength(378);
    expect(all.value.noComm).toEqual([]);
    const picks = shuffled(createRng("comm-search-subset"), all.value.cases).slice(0, 10);
    const subset = searchComms(puzzle, catalogue, { buffer: "UFR", cases: picks.map((c) => c.targets) });
    if (!subset.ok) throw new Error("search failed");
    subset.value.cases.forEach((result, i) => {
      expect(describeComms(result)).toBe(describeComms(picks[i] ?? result));
    });
    // Deterministic.
    const again = searchComms(puzzle, catalogue, { buffer: "UFR", cases: picks.map((c) => c.targets) });
    if (!again.ok) throw new Error("search failed");
    expect(again.value.cases.map(describeComms)).toEqual(subset.value.cases.map(describeComms));
  });

  it("reports bad input as typed errors", async () => {
    const three = await loadPuzzle("3x3x3");
    const four = await loadPuzzle("4x4x4");
    const catalogue = buildCatalogue(three, "corners", { ...DEFAULT_COMM_BOUNDS.corners, maxInsertion: 1, maxSetup: 0 });
    const code = (r: ReturnType<typeof searchComms>) => (r.ok ? "ok" : r.error);
    expect(code(searchComms(three, catalogue, { buffer: "UF" }))).toEqual({ code: "unknown-sticker", sticker: "UF" });
    expect(code(searchComms(three, catalogue, { buffer: "UFR", cases: [["RUF", "DBL"]] }))).toEqual({ code: "same-piece", stickers: ["UFR", "RUF"] });
    expect(code(searchComms(three, catalogue, { buffer: "UFR", cases: [["DBL", "BDL"]] }))).toEqual({ code: "same-piece", stickers: ["DBL", "BDL"] });
    expect(code(searchComms(four, catalogue, { buffer: "UFR" }))).toEqual({ code: "catalogue-puzzle-mismatch", expected: "4x4x4", actual: "3x3x3" });
  });

  it("lists cases the bounds can't solve instead of dropping them", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    // Insertion ≤ 3 with setups ≤ 2 leaves six UFR corner cases without a comm (measured while planning M7).
    const catalogue = buildCatalogue(puzzle, "corners", { ...DEFAULT_COMM_BOUNDS.corners, maxInsertion: 3, maxSetup: 2 });
    const result = searchComms(puzzle, catalogue, { buffer: "UFR" });
    if (!result.ok) throw new Error("search failed");
    expect(result.value.cases).toHaveLength(378);
    expect(result.value.noComm).toHaveLength(6);
    for (const targets of result.value.noComm) expect(result.value.cases.find((c) => c.targets === targets)?.comms).toEqual([]);
  });
});
