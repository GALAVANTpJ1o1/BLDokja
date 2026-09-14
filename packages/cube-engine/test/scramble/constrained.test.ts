import { describe, expect, it } from "vitest";
import { normaliseByCenters } from "../../src/core/frame.js";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { generateConstrained, type ConstrainedResult } from "../../src/scramble/constrained.js";
import { matchesConstraints, type TraceConstraints } from "../../src/scramble/constraints.js";
import { seededStateProvider3x3, type ScrambleProvider } from "../../src/scramble/providers.js";
import { trace, type TraceConfig } from "../../src/trace/trace.js";

async function setting() {
  const puzzle = await loadPuzzle("3x3x3");
  const scheme = speffzScheme(puzzle);
  const traceConfigs: Record<string, TraceConfig> = {
    corners: { pieceType: "corners", buffer: "UFR", scheme },
    edges: { pieceType: "edges", buffer: "UF", scheme },
  };
  return { puzzle, traceConfigs };
}

/** Wraps a provider and counts how often it is asked for candidates and scrambles. */
function counting(provider: ScrambleProvider) {
  const counts = { next: 0, scramble: 0 };
  const wrapped: ScrambleProvider = {
    puzzle: provider.puzzle,
    next: async () => {
      counts.next++;
      const candidate = await provider.next();
      return {
        state: candidate.state,
        scramble: () => {
          counts.scramble++;
          return candidate.scramble();
        },
      };
    },
  };
  return { provider: wrapped, counts };
}

function expectAccepted(puzzle: Puzzle, traceConfigs: Record<string, TraceConfig>, result: ConstrainedResult, constraints: TraceConstraints | undefined): void {
  if (!result.ok) throw new Error(JSON.stringify(result));
  // Traced again here, independently of the generator's own check.
  for (const [name, config] of Object.entries(traceConfigs)) {
    const retraced = trace(puzzle, { alg: result.scramble }, config);
    if (!retraced.ok) throw new Error(JSON.stringify(retraced.error));
    expect(retraced.value, name).toEqual(result.traces[name]);
  }
  expect(normaliseByCenters(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(result.scramble))?.isIdentical(result.state)).toBe(true);
  if (constraints !== undefined) expect(matchesConstraints(result.traces, constraints)).toBe(true);
}

describe("generateConstrained", () => {
  it("finds BRIEF §5.6's examples within budget; each accepted scramble really matches, and the solver runs once", async () => {
    const { puzzle, traceConfigs } = await setting();
    const examples: [string, TraceConstraints][] = [
      ["exactly 2 corner cycle breaks", { corners: { cycleBreaks: { min: 2, max: 2 } } }],
      ["has parity", { corners: { parity: true } }],
      ["at most 8 edge targets", { edges: { targets: { max: 8 } } }],
      ["at least one twisted corner", { corners: { misoriented: { min: 1 } } }],
      ["all of them at once", { corners: { cycleBreaks: { min: 2, max: 2 }, parity: true, misoriented: { min: 1 } }, edges: { targets: { max: 8 } } }],
    ];
    const attempts: Record<string, number> = {};
    for (const [name, constraints] of examples) {
      const { provider, counts } = counting(seededStateProvider3x3(puzzle, { seed: `brief: ${name}` }));
      const result = await generateConstrained(puzzle, { provider, traceConfigs, accept: constraints, maxAttempts: 5000 });
      expectAccepted(puzzle, traceConfigs, result, constraints);
      if (result.ok) attempts[name] = result.attempts;
      expect(counts.scramble, name).toBe(1);
      expect(counts.next, name).toBe(result.ok ? result.attempts : -1);
    }
    // Pinned from the seeds, so a change in sampling or tracing shows up here.
    expect(attempts).toEqual({ "exactly 2 corner cycle breaks": 1, "has parity": 3, "at most 8 edge targets": 41, "at least one twisted corner": 1, "all of them at once": 2372 });
  });

  it("accepts a predicate function too", async () => {
    const { puzzle, traceConfigs } = await setting();
    const result = await generateConstrained(puzzle, {
      provider: seededStateProvider3x3(puzzle, { seed: "predicate" }),
      traceConfigs,
      accept: (traces) => traces.corners?.targetStickers[0] === "DFL",
      maxAttempts: 500,
    });
    expectAccepted(puzzle, traceConfigs, result, undefined);
    expect(result.ok && result.traces.corners?.targetStickers[0]).toBe("DFL");
  });

  it("gives the same result for the same seed", async () => {
    const { puzzle, traceConfigs } = await setting();
    const run = () => generateConstrained(puzzle, { provider: seededStateProvider3x3(puzzle, { seed: "same" }), traceConfigs, accept: { corners: { parity: true, targets: { min: 9 } } }, maxAttempts: 1000 });
    const [a, b] = [await run(), await run()];
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect([b.scramble, b.attempts]).toEqual([a.scramble, a.attempts]);
  });

  it("an impossible constraint uses exactly the budget, never solves, and reports what it saw", async () => {
    const { puzzle, traceConfigs } = await setting();
    // Zero corner targets means an even permutation, so it can't have parity.
    const { provider, counts } = counting(seededStateProvider3x3(puzzle, { seed: "impossible" }));
    const result = await generateConstrained(puzzle, { provider, traceConfigs, accept: { corners: { targets: { max: 0 }, parity: true } }, maxAttempts: 37 });
    expect(counts).toEqual({ next: 37, scramble: 0 });
    if (result.ok || result.reason !== "budget-exhausted") throw new Error(JSON.stringify(result));
    expect(result.attempts).toBe(37);
    expect(result.stats.failures["corners.targets"]).toBe(37);
    expect((result.stats.failures["corners.parity"] ?? 0) + (result.stats.traces.corners?.parity ?? 0)).toBe(37);
    expect(result.stats.traces.corners?.targets.min).toBeGreaterThan(0);
    expect(Object.keys(result.stats.traces).sort()).toEqual(["corners", "edges"]);
  });

  it("reports invalid options before asking the provider for anything", async () => {
    const { puzzle, traceConfigs } = await setting();
    const four = await loadPuzzle("4x4x4");
    const check = async (overrides: Partial<Parameters<typeof generateConstrained>[1]>, target: Puzzle = puzzle) => {
      const { provider, counts } = counting(seededStateProvider3x3(puzzle, { seed: "invalid" }));
      const result = await generateConstrained(target, { provider, traceConfigs, accept: {}, maxAttempts: 10, ...overrides });
      expect(counts.next).toBe(0);
      return result.ok || result.reason !== "invalid-options" ? [] : result.issues.map((i) => i.code);
    };
    expect(await check({ maxAttempts: 0 })).toEqual(["max-attempts"]);
    expect(await check({ maxAttempts: 2.5 })).toEqual(["max-attempts"]);
    expect(await check({ traceConfigs: {} })).toEqual(["no-trace-configs"]);
    expect(await check({ accept: { wings: { parity: true } } })).toEqual(["unknown-trace"]);
    expect(await check({ accept: { corners: { targets: { min: 3, max: 1 } } } })).toEqual(["invalid"]);
    expect(await check({}, four)).toEqual(["puzzle-mismatch"]);
  });

  it("stops at the first trace error, and catches a provider whose scramble doesn't match its state", async () => {
    const { puzzle, traceConfigs } = await setting();
    const badConfig = await generateConstrained(puzzle, {
      provider: seededStateProvider3x3(puzzle, { seed: "bad config" }),
      traceConfigs: { ...traceConfigs, edges: { ...traceConfigs.edges, buffer: "UFR" } as TraceConfig },
      accept: {},
      maxAttempts: 10,
    });
    expect(badConfig.ok ? "ok" : [badConfig.reason, "attempts" in badConfig ? badConfig.attempts : 0]).toEqual(["trace-error", 1]);

    const honest = seededStateProvider3x3(puzzle, { seed: "liar" });
    const liar: ScrambleProvider = { puzzle: "3x3x3", next: async () => ({ state: (await honest.next()).state, scramble: () => Promise.resolve("R U R' U'") }) };
    const mismatch = await generateConstrained(puzzle, { provider: liar, traceConfigs, accept: {}, maxAttempts: 10 });
    expect(mismatch.ok ? "ok" : mismatch.reason).toBe("scramble-mismatch");
  });
});
