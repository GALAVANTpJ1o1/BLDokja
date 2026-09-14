import { describe, expect, it } from "vitest";
import { mod, permutationParity } from "../../src/core/arrays.js";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { DEFAULT_SINGLE_LETTER_REPRESENTATION, memoView, type MemoView } from "../../src/memo/memo.js";
import { trace, type TraceConfig, type TraceInput, type TraceResult } from "../../src/trace/trace.js";
import { coloursToPattern, constructColours, splitTargets } from "../fixtures/construct.js";
import { TRACE_FIXTURES } from "../fixtures/trace-fixtures.js";
import { TraceOracle } from "../oracle/trace-oracle.js";
import { MEMO_FIXTURES, type MemoFixture } from "./memo-fixtures.js";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const memoText = (view: MemoView) => view.items.map((item) => item.letters.join("")).join(" ");
const kindText = (view: MemoView) =>
  view.items.map((item) => ({ pair: "p", loneLetter: "l", orientationMarker: "m" })[item.kind]).join(" ");

function traceFor(puzzle: Puzzle, fixture: MemoFixture): TraceResult {
  const scheme = speffzScheme(puzzle);
  let input: TraceInput;
  let buffer: string;
  if ("traceFixture" in fixture.source) {
    const id = fixture.source.traceFixture;
    const golden = TRACE_FIXTURES.find((f) => f.id === id);
    const spec = golden?.[fixture.pieceType];
    if (golden?.scramble === undefined || spec === undefined) throw new Error(`${fixture.id}: no real-scramble fixture ${id}`);
    input = { alg: golden.scramble };
    buffer = spec.buffer;
  } else {
    const constructed = fixture.source.constructed;
    const spec = constructed[fixture.pieceType];
    if (spec === undefined) throw new Error(`${fixture.id}: no ${fixture.pieceType} in the constructed state`);
    const colours = constructColours(puzzle, constructed);
    const pattern = coloursToPattern(puzzle, colours);
    const { CORNERS: corners, EDGES: edges } = pattern.patternData;
    if (corners === undefined || edges === undefined) throw new Error("missing orbit");
    // The worked example must be a real cube state.
    expect(permutationParity(corners.pieces), `${fixture.id} parities`).toBe(permutationParity(edges.pieces));
    expect(mod(corners.orientation.reduce((a, b) => a + b, 0), 3), `${fixture.id} twist sum`).toBe(0);
    expect(mod(edges.orientation.reduce((a, b) => a + b, 0), 2), `${fixture.id} flip sum`).toBe(0);
    // The independent oracle reads the same targets from the colours.
    const oracle = new TraceOracle(3, fixture.pieceType).trace(colours, {
      kind: fixture.pieceType,
      buffer: spec.buffer,
      letters: speffzScheme(puzzle).letters[fixture.pieceType] ?? {},
      orientedInPlace: "separate",
    });
    const letters = scheme.letters[fixture.pieceType] ?? {};
    expect(oracle.targetStickers.map((s) => letters[s]), `${fixture.id} oracle`).toEqual(splitTargets(spec.targets));
    input = { pattern };
    buffer = spec.buffer;
  }
  const result = trace(puzzle, input, { pieceType: fixture.pieceType, buffer, scheme });
  if (!result.ok) throw new Error(`${fixture.id}: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("memo view: D-015 worked examples", () => {
  it.each(MEMO_FIXTURES.map((f) => [f.id, f] as [string, MemoFixture]))("%s", async (_id, fixture) => {
    const puzzle = await loadPuzzle("3x3x3");
    const result = deepFreeze(traceFor(puzzle, fixture));
    if (fixture.trace !== undefined) {
      expect(result.targets).toEqual(splitTargets(fixture.trace.targets));
      expect(result.parity).toBe(fixture.trace.parity);
      expect(
        result.orientedInPlace.map((o) => `${o.piece} ${o.letter} ${o.direction}${o.isBuffer ? " buffer" : ""}`).join(", "),
      ).toBe(fixture.trace.orientedInPlace);
    }
    for (const mode of ["selfPair", "chain"] as const) {
      const view = memoView(result, { singleLetterRepresentation: mode });
      expect(view.singleLetterRepresentation).toBe(mode);
      expect(memoText(view), `${fixture.id} ${mode}`).toBe(fixture[mode].memo);
      expect(kindText(view), `${fixture.id} ${mode} kinds`).toBe(fixture[mode].kinds);
      expect(view.parity, `${fixture.id} ${mode} parity`).toBe(fixture.parity);
    }
  });
});

describe("memo view: contract", () => {
  it("defaults to selfPair", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const fixture = MEMO_FIXTURES.find((f) => f.id === "M-R01");
    if (fixture === undefined) throw new Error("missing fixture");
    const result = traceFor(puzzle, fixture);
    expect(DEFAULT_SINGLE_LETTER_REPRESENTATION).toBe("selfPair");
    expect(memoView(result)).toEqual(memoView(result, { singleLetterRepresentation: "selfPair" }));
  });

  it("never modifies the trace it reads", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    for (const fixture of MEMO_FIXTURES) {
      const result = traceFor(puzzle, fixture);
      const before = structuredClone(result);
      deepFreeze(result);
      for (const mode of ["selfPair", "chain"] as const) memoView(result, { singleLetterRepresentation: mode });
      expect(result).toEqual(before);
    }
  });

  it("copies parity from the trace and never infers it from the items", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    for (const fixture of MEMO_FIXTURES) {
      const result = deepFreeze(traceFor(puzzle, fixture));
      // A deliberately inconsistent trace: if parity were derived from targets or doubled items, this would show.
      const flipped = deepFreeze({ ...result, parity: !result.parity });
      for (const mode of ["selfPair", "chain"] as const) {
        const real = memoView(result, { singleLetterRepresentation: mode });
        const altered = memoView(flipped, { singleLetterRepresentation: mode });
        expect(altered.parity).toBe(!real.parity);
        expect(altered.items).toEqual(real.items);
      }
    }
  });

  it("is not a tracing option", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const config: TraceConfig = {
      pieceType: "corners",
      buffer: "UFR",
      scheme,
      // @ts-expect-error singleLetterRepresentation belongs to the memo layer, never to tracing (D-015).
      singleLetterRepresentation: "chain",
    };
    const policyConfig: TraceConfig = {
      pieceType: "corners",
      buffer: "UFR",
      scheme,
      policy: {
        // @ts-expect-error nor to the trace policy.
        singleLetterRepresentation: "chain",
      },
    };
    // Checked by `pnpm typecheck`; at runtime tracing simply ignores the stray key.
    const plain = trace(puzzle, { alg: "R U" }, { pieceType: "corners", buffer: "UFR", scheme });
    expect(trace(puzzle, { alg: "R U" }, config)).toEqual(plain);
    expect(trace(puzzle, { alg: "R U" }, policyConfig)).toEqual(plain);
  });
});
