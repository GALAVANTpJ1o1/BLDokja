import { describe, expect, it } from "vitest";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { buildCatalogue, DEFAULT_COMM_BOUNDS } from "../../src/commutator/catalogue.js";
import { formatAlg } from "../../src/commutator/parse.js";
import { searchComms, type CommCaseResult } from "../../src/commutator/search.js";
import { validateComm } from "../../src/commutator/validate.js";
import { createRng, shuffled } from "../../src/random/prng.js";

/**
 * Full case sets for one buffer per piece type (DECISIONS D-019). Timings are printed, not asserted,
 * except a 3× budget tripwire that only catches large regressions; `pnpm engine:bench comms` is the
 * measurement of record.
 */
const TRIPWIRE_MS = 180_000;

const describeComms = (r: CommCaseResult) => r.comms.map((c) => formatAlg(c.alg)).join(" | ");

function checkAll(puzzle: Puzzle, buffer: string, cases: readonly CommCaseResult[]): number {
  const failures: string[] = [];
  let comms = 0;
  for (const result of cases) {
    for (const comm of result.comms) {
      comms++;
      const check = validateComm(puzzle, comm.alg, [buffer, result.targets[0], result.targets[1]]);
      if (!check.ok || !check.value.valid) failures.push(`${result.targets.join(" ")}: ${formatAlg(comm.alg)}`);
    }
  }
  expect(failures.slice(0, 5)).toEqual([]);
  return comms;
}

describe("comm search, full buffers", () => {
  it("UFR corners: all 378 cases, identical with and without pruning, every comm valid", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const started = performance.now();
    const catalogue = buildCatalogue(puzzle, "corners", DEFAULT_COMM_BOUNDS.corners);
    const pruned = searchComms(puzzle, catalogue, { buffer: "UFR" });
    const elapsed = performance.now() - started;
    const brute = searchComms(puzzle, catalogue, { buffer: "UFR", prune: false });
    if (!pruned.ok || !brute.ok) throw new Error("search failed");
    expect(pruned.value.cases).toHaveLength(378);
    expect(pruned.value.noComm).toEqual([]);
    expect(pruned.value.cases.map(describeComms)).toEqual(brute.value.cases.map(describeComms));
    const comms = checkAll(puzzle, "UFR", pruned.value.cases);
    console.log(`UFR corners: catalogue + search ${(elapsed / 1000).toFixed(2)} s, ${comms} comms verified`);
    expect(elapsed).toBeLessThan(TRIPWIRE_MS);
  });

  it("UF edges: all 440 cases pruned, every comm valid; 60 seeded cases identical without pruning", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const started = performance.now();
    const catalogue = buildCatalogue(puzzle, "edges", DEFAULT_COMM_BOUNDS.edges);
    const pruned = searchComms(puzzle, catalogue, { buffer: "UF" });
    const elapsed = performance.now() - started;
    if (!pruned.ok) throw new Error("search failed");
    expect(pruned.value.cases).toHaveLength(440);
    expect(pruned.value.noComm).toEqual([]);
    const comms = checkAll(puzzle, "UF", pruned.value.cases);
    console.log(`UF edges: catalogue + search ${(elapsed / 1000).toFixed(2)} s, ${comms} comms verified`);
    expect(elapsed).toBeLessThan(TRIPWIRE_MS);

    const sample = shuffled(createRng("comm-search-slow-UF"), pruned.value.cases).slice(0, 60);
    const brute = searchComms(puzzle, catalogue, { buffer: "UF", cases: sample.map((c) => c.targets), prune: false });
    if (!brute.ok) throw new Error("search failed");
    expect(brute.value.cases.map(describeComms)).toEqual(sample.map(describeComms));
  });
});
