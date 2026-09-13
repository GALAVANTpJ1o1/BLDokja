import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { trace, type TraceInput, type TracePolicy, type TraceResult } from "../../src/trace/trace.js";
import { coloursToPattern, constructColours, fixtureScheme, splitTargets, typeFixtures } from "../fixtures/construct.js";
import { TRACE_FIXTURES, type Expected, type TraceFixture } from "../fixtures/trace-fixtures.js";
import { TraceOracle } from "../oracle/trace-oracle.js";

const scrambles = JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", "trace-scrambles.json"), "utf8")) as Record<
  string,
  { colours: string; scramble: string }
>;

function checkExpected(actual: TraceResult, targets: string, expected: Expected, label: string): void {
  expect(actual.targets, `${label} targets`).toEqual(splitTargets(targets));
  expect(actual.cycleBreaks, `${label} cycleBreaks`).toEqual(expected.cycleBreaks);
  expect(actual.parity, `${label} parity`).toBe(expected.parity);
  if (expected.kinds !== undefined) expect(actual.targetKinds, `${label} kinds`).toEqual(expected.kinds);
  if (expected.twisted !== undefined) expect(actual.twisted, `${label} twisted`).toEqual(expected.twisted);
  if (expected.flipped !== undefined) expect(actual.flipped, `${label} flipped`).toEqual(expected.flipped);
  if (expected.solvedPieces !== undefined) {
    expect([...actual.solvedPieces].sort(), `${label} solvedPieces`).toEqual([...expected.solvedPieces].sort());
  }
}

describe("golden trace fixtures", () => {
  it("has at least 50 fixtures (40+ constructed, 10 real scrambles) covering every §5.3 category", () => {
    expect(TRACE_FIXTURES.length).toBeGreaterThanOrEqual(50);
    expect(TRACE_FIXTURES.filter((f) => f.scramble === undefined).length).toBeGreaterThanOrEqual(40);
    expect(TRACE_FIXTURES.filter((f) => f.scramble !== undefined).length).toBeGreaterThanOrEqual(10);
    const categories = new Set(TRACE_FIXTURES.flatMap((f) => f.categories));
    for (const required of [
      "no-breaks",
      "one-break",
      "several-breaks",
      "flipped-only",
      "twisted-only",
      "twisted-and-flipped",
      "parity",
      "solved-buffer",
      "fully-solved-type",
      "buffer-misoriented-at-start",
      "buffer-misoriented-at-end",
      "closes-on-other-sticker",
      "trailing-single",
      "custom-break-order",
      "custom-scheme",
      "as-targets",
      "buffers",
      "4x4",
    ]) {
      expect(categories, required).toContain(required);
    }
    expect(new Set(TRACE_FIXTURES.map((f) => f.id)).size).toBe(TRACE_FIXTURES.length);
  });

  describe.each(TRACE_FIXTURES.map((f) => [f.id, f] as [string, TraceFixture]))("%s", (_id, fixture) => {
    it(fixture.description, async () => {
      const puzzle = await loadPuzzle(fixture.puzzle);
      const scheme = fixtureScheme(puzzle, fixture);
      const colours = constructColours(puzzle, fixture);

      const inputs: { label: string; input: TraceInput }[] = [];
      if (fixture.scramble !== undefined) {
        inputs.push({ label: "scramble", input: { alg: fixture.scramble } });
      } else if (fixture.puzzle === "3x3x3") {
        const stored = scrambles[fixture.id];
        if (stored === undefined) throw new Error(`no scramble for ${fixture.id}: run scripts/build-trace-fixtures.ts`);
        expect(stored.colours, "stored scramble is stale: rerun scripts/build-trace-fixtures.ts").toBe(colours.join(""));
        // The scramble reaches the constructed state in the independent geometry model too.
        expect(new TraceOracle(3, "corners").coloursAfter(stored.scramble).join("")).toBe(colours.join(""));
        inputs.push({ label: "scramble", input: { alg: stored.scramble } });
        for (const suffix of fixture.rotationSuffixes ?? []) {
          inputs.push({ label: `scramble + ${suffix}`, input: { alg: `${stored.scramble} ${suffix}` } });
        }
      } else {
        inputs.push({ label: "pattern", input: { pattern: coloursToPattern(puzzle, colours) } });
      }

      for (const [typeId, spec] of typeFixtures(fixture)) {
        const oracle = new TraceOracle(puzzle.size, typeId);
        const runs: { policy: TracePolicy; targets: string; expected: Expected }[] = [
          { policy: spec.policy ?? {}, targets: spec.targets, expected: spec.expected },
          ...(spec.alternates ?? []),
        ];
        for (const run of runs) {
          for (const { label, input } of inputs) {
            const context = `${fixture.id} ${typeId} ${label} ${JSON.stringify(run.policy)}`;
            const result = trace(puzzle, input, {
              pieceType: typeId,
              buffer: spec.buffer,
              scheme,
              frame: fixture.puzzle === "3x3x3" ? { kind: "centers" } : { kind: "asIs" },
              policy: run.policy,
            });
            if (!result.ok) throw new Error(`${context}: ${JSON.stringify(result.error)}`);
            checkExpected(result.value, run.targets, run.expected, context);
          }
          // The oracle agrees with the hand-written targets as well.
          const oracleResult = oracle.trace(colours, {
            kind: typeId,
            buffer: spec.buffer,
            letters: scheme.letters[typeId] ?? {},
            orientedInPlace: run.policy.orientedInPlace ?? "separate",
            ...(Array.isArray(run.policy.breakOrder) ? { breakOrder: run.policy.breakOrder } : {}),
          });
          const letters = scheme.letters[typeId] ?? {};
          expect(oracleResult.targetStickers.map((s) => letters[s]), `${fixture.id} ${typeId} oracle`).toEqual(splitTargets(run.targets));
        }
      }
    });
  });
});
