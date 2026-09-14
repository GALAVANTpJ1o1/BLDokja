import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { constraintFailures, constraintMeasures, matchesConstraints, TraceConstraintsSchema, validateConstraints, type TraceConstraints } from "../../src/scramble/constraints.js";
import { trace, type TraceResult } from "../../src/trace/trace.js";
import { splitTargets } from "../fixtures/construct.js";
import { TRACE_FIXTURES } from "../fixtures/trace-fixtures.js";

async function tracesOf(fixtureId: string, orientedInPlace: "separate" | "asTargets"): Promise<Record<"corners" | "edges", TraceResult>> {
  const puzzle = await loadPuzzle("3x3x3");
  const fixture = TRACE_FIXTURES.find((f) => f.id === fixtureId);
  if (fixture?.scramble === undefined || fixture.corners === undefined || fixture.edges === undefined) throw new Error(fixtureId);
  const one = (typeId: "corners" | "edges", buffer: string) => {
    const result = trace(puzzle, { alg: fixture.scramble ?? "" }, { pieceType: typeId, buffer, scheme: speffzScheme(puzzle), policy: { orientedInPlace } });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.value;
  };
  return { corners: one("corners", fixture.corners.buffer), edges: one("edges", fixture.edges.buffer) };
}

describe("constraintMeasures", () => {
  it("counts targets, breaks, misoriented pieces and parity the same way as the hand-traced golden fixtures, under both policies", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const letters = speffzScheme(puzzle).letters;
    const samePiece = (typeId: "corners" | "edges", a: string, b: string) => pieceType(puzzle, typeId).stickerByName(a)?.position === pieceType(puzzle, typeId).stickerByName(b)?.position;
    for (const id of ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10"]) {
      const fixture = TRACE_FIXTURES.find((f) => f.id === id);
      for (const typeId of ["corners", "edges"] as const) {
        const spec = fixture?.[typeId];
        if (spec === undefined) throw new Error(id);
        // Expected values come from the hand-written fixture (separate policy): its letters, its breaks,
        // and its twisted or flipped letters minus the buffer piece's own.
        const bufferPieceLetters = new Set(Object.entries(letters[typeId] ?? {}).filter(([sticker]) => samePiece(typeId, sticker, spec.buffer)).map(([, letter]) => letter));
        const misoriented = [...(spec.expected.twisted ?? []), ...(spec.expected.flipped ?? [])].filter((letter) => !bufferPieceLetters.has(letter)).length;
        const separateTargets = splitTargets(spec.targets).length;
        const expected = { targets: separateTargets, cycleBreaks: spec.expected.cycleBreaks.length, misoriented, parity: spec.expected.parity };

        const separate = await tracesOf(id, "separate");
        expect(constraintMeasures(separate[typeId]), `${id} ${typeId} separate`).toEqual(expected);
        // Under asTargets each misoriented piece becomes a two-target orientation cycle; nothing else changes.
        const asTargets = await tracesOf(id, "asTargets");
        expect(constraintMeasures(asTargets[typeId]), `${id} ${typeId} asTargets`).toEqual({ ...expected, targets: separateTargets + 2 * misoriented });
      }
    }
  });
});

describe("matching constraints", () => {
  it("each field and bound, on R01 (corners: 6 targets, 1 break, 2 twisted, no parity)", async () => {
    const traces = await tracesOf("R01", "separate");
    const check = (constraints: TraceConstraints) => constraintFailures(traces, constraints).map((f) => `${f.trace}.${f.field}`);
    expect(check({ corners: { targets: { min: 6, max: 6 }, cycleBreaks: { min: 1 }, misoriented: { max: 2 }, parity: false } })).toEqual([]);
    expect(check({ corners: { targets: { min: 7 } } })).toEqual(["corners.targets"]);
    expect(check({ corners: { targets: { max: 5 } } })).toEqual(["corners.targets"]);
    expect(check({ corners: { cycleBreaks: { max: 0 } }, edges: { cycleBreaks: { min: 3, max: 3 } } })).toEqual(["corners.cycleBreaks"]);
    expect(check({ corners: { misoriented: { min: 3 } } })).toEqual(["corners.misoriented"]);
    expect(check({ corners: { parity: true }, edges: { parity: true } })).toEqual(["corners.parity", "edges.parity"]);
    // A constraint on a trace that isn't there fails every field it sets.
    expect(check({ wings: { targets: { min: 0 }, parity: false } })).toEqual(["wings.targets", "wings.parity"]);
    expect(matchesConstraints(traces, {})).toBe(true);
    expect(matchesConstraints(traces, { edges: { targets: { max: 12 } } })).toBe(true);
    expect(matchesConstraints(traces, { edges: { targets: { max: 11 } } })).toBe(false);
  });
});

describe("validateConstraints", () => {
  it("accepts valid constraints, round-trips through JSON, and rejects bad bounds, unknown fields and unknown traces", () => {
    const valid = { corners: { targets: { min: 2, max: 8 }, parity: true }, edges: { misoriented: { min: 1 } } };
    const parsed = validateConstraints(JSON.parse(JSON.stringify(valid)), ["corners", "edges"]);
    expect(parsed).toEqual({ ok: true, value: valid });
    expect(TraceConstraintsSchema.parse(JSON.parse(JSON.stringify(valid)))).toEqual(valid);

    const codes = (input: unknown) => {
      const result = validateConstraints(input, ["corners", "edges"]);
      return result.ok ? [] : result.error.map((issue) => (issue.code === "invalid" ? `invalid:${issue.path.join(".")}` : `unknown-trace:${issue.trace}`));
    };
    expect(codes({ corners: { targets: { min: 5, max: 2 } } })).toEqual(["invalid:corners.targets"]);
    expect(codes({ corners: { cycleBreaks: { min: -1 } } })).toEqual(["invalid:corners.cycleBreaks.min"]);
    expect(codes({ corners: { targets: { min: 1.5 } } })).toEqual(["invalid:corners.targets.min"]);
    expect(codes({ corners: { twisted: { min: 1 } } })).toEqual(["invalid:corners"]);
    expect(codes({ corners: { parity: "yes" } })).toEqual(["invalid:corners.parity"]);
    expect(codes({ wings: { targets: { max: 3 } } })).toEqual(["unknown-trace:wings"]);
  });
});
