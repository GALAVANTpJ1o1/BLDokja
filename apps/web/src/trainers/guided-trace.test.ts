import { loadPuzzle, parseAlg, speffzScheme, trace } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { afterScramble, chooseLevel, explanationWanted, lookupKind, median, resumeAuto, scrambleTraces, sessionScramble, startRamp, summarise, type RampState } from "./guided-trace";

describe("guided trace scrambles", () => {
  it("are reproducible from seed and index, 25 face turns, and differ between indices", () => {
    const a = sessionScramble("my seed", 0);
    expect(sessionScramble("my seed", 0)).toBe(a);
    expect(sessionScramble("my seed", 1)).not.toBe(a);
    expect(a.split(" ")).toHaveLength(25);
    expect(parseAlg("3x3x3", a).ok).toBe(true);
    const faces = a.split(" ").map((m) => m[0]);
    expect(faces.every((f, i) => i === 0 || f !== faces[i - 1])).toBe(true);
  });

  it("traces edges before corners, and each piece trace equals the engine's", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const scramble = sessionScramble("order", 3);
    const traces = scrambleTraces(puzzle, scheme, scramble, "both", { corners: "UBL", edges: "UR" });
    expect(traces.map((t) => t.pieceType)).toEqual(["edges", "corners"]);
    for (const t of traces) {
      const direct = trace(puzzle, { alg: scramble }, { pieceType: t.pieceType, buffer: t.pieceType === "corners" ? "UBL" : "UR", scheme, policy: { orientedInPlace: "asTargets" } });
      if (!direct.ok) throw new Error("trace");
      expect(t.steps.map((s) => s.letter)).toEqual(direct.value.targets);
      expect(t.parity).toBe(direct.value.parity);
    }
  });
});

describe("timing breakdown", () => {
  it("classifies lookups and takes medians per kind", () => {
    expect(lookupKind({ index: 0, letter: "A", target: "UBL", kind: "normal", chosen: false, look: "UBL" })).toBe("first");
    expect(lookupKind({ index: 3, letter: "A", target: "UBL", kind: "cycleBreak", chosen: true, look: "UBL" })).toBe("break");
    expect(lookupKind({ index: 4, letter: "A", target: "UBL", kind: "orientationTarget", chosen: true, look: "UBL" })).toBe("twist");
    expect(lookupKind({ index: 5, letter: "A", target: "UBL", kind: "cycleClose", chosen: false, look: "UBL" })).toBe("normal");
    expect([median([]), median([5]), median([1, 9]), median([3, 1, 2])]).toEqual([undefined, 5, 5, 2]);
    const s = summarise([
      { kind: "first", correct: true, responseMs: 1000 },
      { kind: "normal", correct: false, responseMs: 3000 },
      { kind: "normal", correct: true, responseMs: 1000 },
      { kind: "break", correct: true, responseMs: 5000 },
    ]);
    expect(s).toEqual({ targets: 4, errors: 1, medianMs: { first: 1000, normal: 2000, break: 5000 } });
  });
});

describe("difficulty ramp", () => {
  const run = (state: RampState, errors: number[]) => errors.reduce<RampState>((s, e) => afterScramble(s, e), state);

  it("goes up after three clean scrambles in a row, and the streak restarts", () => {
    expect(run(startRamp(), [0, 0]).level).toBe(1);
    expect(run(startRamp(), [0, 0, 0]).level).toBe(2);
    expect(run(startRamp(), [0, 1, 0, 0]).level).toBe(1);
    expect(run(startRamp(), [0, 0, 0, 0, 0]).level).toBe(2);
    expect(run(startRamp(), [0, 0, 0, 0, 0, 0]).level).toBe(3);
    expect(run(startRamp(4), [0, 0, 0]).level).toBe(4);
  });

  it("goes down after two scrambles in a row with three or more errors", () => {
    expect(run(startRamp(3), [3]).level).toBe(3);
    expect(run(startRamp(3), [3, 4]).level).toBe(2);
    expect(run(startRamp(3), [3, 2, 5]).level).toBe(3);
    expect(run(startRamp(1), [9, 9]).level).toBe(1);
    expect(afterScramble(afterScramble(startRamp(2), 3), 3).changed).toBe("down");
  });

  it("choosing a level by hand stops automatic changes until auto is turned back on", () => {
    const manual = chooseLevel(3);
    expect(run(manual, [0, 0, 0, 0]).level).toBe(3);
    expect(run(manual, [5, 5]).level).toBe(3);
    expect(run(resumeAuto(manual), [0, 0, 0]).level).toBe(4);
  });
});

describe("explanations", () => {
  it("are shown for breaks and twists until three correct answers of that kind, and always on demand", () => {
    expect(explanationWanted("break", {}, false)).toBe(true);
    expect(explanationWanted("break", { break: 2 }, false)).toBe(true);
    expect(explanationWanted("break", { break: 3 }, false)).toBe(false);
    expect(explanationWanted("twist", { break: 5 }, false)).toBe(true);
    expect(explanationWanted("normal", {}, false)).toBe(false);
    expect(explanationWanted("normal", {}, true)).toBe(true);
  });
});
