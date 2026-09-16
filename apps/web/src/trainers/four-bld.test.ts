import { loadPuzzle } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { algDatasets } from "@/content/algs";
import { readerFor4x4 } from "@/lib/reader-4x4";
import { centreSession, fourBldScramble, shotCases, shotSetup, specialShots, traceOf } from "./four-bld";

/**
 * The 4BLD trainers only ever show verified algs, and their tracing has to accept every right answer:
 * x-centres of a colour are the same piece, so most steps have more than one.
 */

describe("shot cases", () => {
  it("r2 and U2 give one case per target, with the odd/even rule and the free swap slot", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const reader = readerFor4x4(puzzle);
    const { r2Wings, u2Centres } = algDatasets();
    const wings = shotCases(r2Wings, reader, "wings");
    const centres = shotCases(u2Centres, reader, "xcenters");
    expect(wings).toHaveLength(23);
    expect(centres).toHaveLength(23);
    expect(wings.map((c) => c.id)).toContain("r2:UFr");
    // The two wings r2 carries are special, and each is shot as the other on the second target of a pair.
    expect(wings.filter((c) => c.special).map((c) => c.target)).toEqual(["UFr", "DBr"]);
    expect(wings.find((c) => c.target === "UFr")?.shootAs).toBe("DBr");
    // U2's swap slot needs no setup: the swap on its own.
    const free = centres.find((c) => c.target === "Ufl");
    expect(free?.setup).toBe("");
    expect(free?.moves).toBe("U2");
    // Every case has a letter from the scheme.
    expect(wings.every((c) => /^[A-X]$/.test(c.letter))).toBe(true);
    expect(centres.every((c) => /^[A-X]$/.test(c.letter))).toBe(true);
  });

  it("every case's alg solves the state the trainer shows it from", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const reader = readerFor4x4(puzzle);
    const { r2Wings, u2Centres } = algDatasets();
    for (const [dataset, pieces] of [
      [r2Wings, "wings"],
      [u2Centres, "xcenters"],
    ] as const) {
      for (const shot of shotCases(dataset, reader, pieces)) {
        const setup = shotSetup(puzzle, shot);
        expect(setup, shot.id).toBeDefined();
        const solved = puzzle.kpuzzle.defaultPattern();
        expect(solved.applyAlg(setup ?? "").applyAlg(shot.moves).isIdentical(solved), `${shot.id}: ${shot.moves}`).toBe(true);
      }
    }
  });
});

describe("special cases in both positions", () => {
  it("an even step uses the target's own alg, an odd step its partner's, as the dataset's rule says", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const reader = readerFor4x4(puzzle);
    const { r2Wings, u2Centres } = algDatasets();
    for (const [dataset, pieces] of [
      [r2Wings, "wings"],
      [u2Centres, "xcenters"],
    ] as const) {
      const specials = specialShots(dataset, reader, pieces);
      expect(specials).toHaveLength(dataset.specialTargets.length * 2);
      expect(new Set(specials.map((c) => c.id)).size).toBe(specials.length);
      for (const rule of dataset.oddStepRule) {
        const even = specials.find((c) => c.target === rule.target && c.position === "even");
        const odd = specials.find((c) => c.target === rule.target && c.position === "odd");
        expect(even?.id).toBe(`${dataset.method}:${rule.target}:even`);
        expect(even?.shootAs).toBeUndefined();
        expect(even?.moves).toBe(dataset.records.find((r) => r.target === rule.target)?.algs[0]?.moves);
        expect(odd?.shootAs).toBe(rule.shootAs);
        expect(odd?.moves).toBe(dataset.records.find((r) => r.target === rule.shootAs)?.algs[0]?.moves);
        // Both still show the target the learner memorised, not the partner.
        expect(odd?.letter).toBe(even?.letter);
      }
    }
  });
});

describe("4BLD scrambles", () => {
  it("are seeded, 40 moves of outer and wide turns, and scramble the x-centres", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const reader = readerFor4x4(puzzle);
    expect(fourBldScramble("abc", 0)).toBe(fourBldScramble("abc", 0));
    expect(fourBldScramble("abc", 0)).not.toBe(fourBldScramble("abc", 1));
    const moves = fourBldScramble("abc", 0).split(" ");
    expect(moves).toHaveLength(40);
    expect(moves.every((m) => /^[UDRLFB]w?['2]?$/.test(m))).toBe(true);
    expect(centreSession(reader, fourBldScramble("abc", 0))?.done).toBe(false);
  });
});

describe("tracing x-centres", () => {
  const scramble = "2R U2 2F' D R2 2U F 2L' B2 U' 2R2 D2 F' 2D R 2B U2 L' 2F2 D";

  it("accepts any slot of the right colour, and ends solved either way", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const reader = readerFor4x4(puzzle);
    const session = centreSession(reader, scramble);
    if (session === undefined) throw new Error("no session");

    let steps = 0;
    let hadAChoice = false;
    while (!session.done && steps < 60) {
      const step = session.next();
      if (step === undefined) break;
      expect(step.accepted.length).toBeGreaterThan(0);
      if (step.accepted.length > 1) hadAChoice = true;
      // Take the last of the accepted answers, which is rarely the one the engine would pick itself.
      const letter = step.letters[step.letters.length - 1] ?? "";
      expect(session.answer(letter), letter).toBeDefined();
      steps++;
    }
    expect(session.done).toBe(true);
    expect(session.count).toBe(steps);
    expect(hadAChoice, "a scramble should offer a choice somewhere").toBe(true);
  });

  it("refuses a letter that isn't one of the answers", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const reader = readerFor4x4(puzzle);
    const session = centreSession(reader, scramble);
    if (session === undefined) throw new Error("no session");
    const step = session.next();
    if (step === undefined) throw new Error("solved already");
    const wrong = "ABCDEFGHIJKLMNOPQRSTUVWX".split("").find((l) => !step.letters.includes(l));
    expect(session.answer(wrong ?? "")).toBeUndefined();
    expect(session.count).toBe(0);
    // The right one still works afterwards.
    expect(session.answer(step.letters[0] ?? "")).toBeDefined();
  });
});

describe("tracing wings and corners", () => {
  it("reads targets for both, from the 4BLD buffers", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const reader = readerFor4x4(puzzle);
    const scramble = "R U2 2R' F 2D B2 L' 2U R2 D' 2F U L2 2B' D2";
    for (const pieces of ["wings", "corners"] as const) {
      const result = traceOf(reader, scramble, pieces);
      expect(result, pieces).toBeDefined();
      expect(result?.targets.length ?? 0, pieces).toBeGreaterThan(0);
      // Every target is a letter of the scheme, and the buffer is the one the datasets use.
      expect(result?.targets.every((letter) => /^[A-X]$/.test(letter)), pieces).toBe(true);
      expect(result?.buffer.sticker, pieces).toBe(reader.buffers[pieces]);
    }
  });
});
