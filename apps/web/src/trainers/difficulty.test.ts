import { loadPuzzle, matchesConstraints, speffzScheme, trace } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { constrainedScramble, presetFragment, readPresetFragment, subsetOf, timeVerdict, traceConstraints } from "./difficulty";

describe("difficulty customiser", () => {
  it("turns the settings into engine constraints for the piece types in play only", () => {
    expect(traceConstraints(undefined)).toBeUndefined();
    expect(traceConstraints({ constraints: { edges: {} } })).toBeUndefined();
    const both = traceConstraints({ constraints: { edges: { targets: { min: 8, max: 10 } }, corners: { parity: false, cycleBreaks: { max: 0 } } } });
    expect(both).toEqual({ edges: { targets: { min: 8, max: 10 } }, corners: { parity: false, cycleBreaks: { max: 0 } } });
    expect(traceConstraints({ pieces: "corners", constraints: { edges: { targets: { min: 8 } }, corners: { misoriented: { min: 1 } } } })).toEqual({ corners: { misoriented: { min: 1 } } });
  });

  it("generates reproducible scrambles that really meet the constraints for your buffers", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const buffers = { corners: "UBL", edges: "UR" };
    const constraints = { corners: { parity: true, misoriented: { min: 1 } }, edges: { cycleBreaks: { min: 1 } } };
    const first = await constrainedScramble(puzzle, scheme, buffers, constraints, "diff", 0);
    const again = await constrainedScramble(puzzle, scheme, buffers, constraints, "diff", 0);
    if (!first.ok) throw new Error(first.reason);
    expect(again).toEqual(first);
    const traces = {
      corners: trace(puzzle, { alg: first.scramble }, { pieceType: "corners", buffer: "UBL", scheme, policy: { orientedInPlace: "asTargets" } }),
      edges: trace(puzzle, { alg: first.scramble }, { pieceType: "edges", buffer: "UR", scheme, policy: { orientedInPlace: "asTargets" } }),
    };
    if (!traces.corners.ok || !traces.edges.ok) throw new Error("trace");
    expect(matchesConstraints({ corners: traces.corners.value, edges: traces.edges.value }, constraints)).toBe(true);
    const impossible = await constrainedScramble(puzzle, scheme, buffers, { corners: { targets: { min: 30 } } }, "diff", 0);
    expect(impossible).toEqual({ ok: false, reason: "budget-exhausted" });
  }, 60_000);

  it("soft time pressure marks slow answers, a hard cutoff fails them", () => {
    expect(timeVerdict(undefined, 9000)).toBe("none");
    expect(timeVerdict({ time: { mode: "soft", seconds: 2 } }, 1500)).toBe("in-time");
    expect(timeVerdict({ time: { mode: "soft", seconds: 2 } }, 2500)).toBe("over-target");
    expect(timeVerdict({ time: { mode: "hard", seconds: 2 } }, 2500)).toBe("timed-out");
  });

  it("applies a case subset only when it matches some cases", () => {
    const cases = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(subsetOf({ cases: { m2op: ["b", "c"] } }, "m2op", cases)).toEqual({ cases: [{ id: "b" }, { id: "c" }], applied: true });
    expect(subsetOf({ cases: { m2op: ["z"] } }, "m2op", cases).applied).toBe(false);
    expect(subsetOf(undefined, "m2op", cases).cases).toHaveLength(3);
  });

  it("shares a preset as a URL fragment that reads back validated, and rejects tampering", () => {
    const preset = { id: "p", name: "Parity drill ✓", difficulty: { constraints: { corners: { parity: true } }, time: { mode: "hard" as const, seconds: 4 } } };
    const fragment = presetFragment(preset);
    expect(fragment).toMatch(/^preset=[A-Za-z0-9_-]+$/);
    expect(readPresetFragment(`#${fragment}`)).toEqual(preset);
    expect(readPresetFragment("#preset=bm90IGpzb24")).toBeUndefined();
    const invalid = { id: "x", name: "Broken", difficulty: { constraints: { edges: { targets: { min: 9, max: 2 } } } } };
    expect(readPresetFragment(`#${presetFragment(invalid)}`)).toBeUndefined();
    expect(readPresetFragment("#other=1")).toBeUndefined();
  });
});
