import { loadPuzzle, OpSetupsDatasetSchema, speffzScheme, trace } from "@bld/cube-engine";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkpointRng, compareLetters, gradeLetters, gradeSetup, letterItems, parityItems, scrambleFor, setupItems, traceItems, type ItemContext } from "./checkpoint-items";

const dataset = (name: string) => OpSetupsDatasetSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "content", "algs", "3x3", name), "utf8")));

async function context(): Promise<ItemContext> {
  const puzzle = await loadPuzzle("3x3x3");
  return { puzzle, scheme: speffzScheme(puzzle), buffers: { corners: "UBL", edges: "UR" } };
}

describe("checkpoint items", () => {
  it("are reproducible from lesson, checkpoint and attempt, and differ between attempts", async () => {
    const ctx = await context();
    const a = letterItems(ctx, checkpointRng("speffz", "letters", 0), ["corners", "edges"], 10);
    expect(letterItems(ctx, checkpointRng("speffz", "letters", 0), ["corners", "edges"], 10)).toEqual(a);
    expect(letterItems(ctx, checkpointRng("speffz", "letters", 1), ["corners", "edges"], 10)).not.toEqual(a);
    expect(new Set(a.map((i) => (i.kind === "letter" ? i.sticker : ""))).size).toBe(10);
  });

  it("letter answers are the scheme's letters (Speffz: UBL is A, UR is B, DFR is V)", async () => {
    const ctx = await context();
    expect([ctx.scheme.letters.corners?.UBL, ctx.scheme.letters.edges?.UR, ctx.scheme.letters.corners?.DFR]).toEqual(["A", "B", "V"]);
    for (const item of letterItems(ctx, checkpointRng("x", "y", 3), ["corners", "edges"], 20)) {
      if (item.kind !== "letter") throw new Error("kind");
      expect(ctx.scheme.letters[item.pieceType]?.[item.sticker]).toBe(item.answer);
    }
  });

  it("trace items meet their requirement and their answers equal an independent trace of the scramble", async () => {
    const ctx = await context();
    const rng = checkpointRng("trace", "t", 0);
    for (const requires of ["no-breaks", "break", "twist"] as const) {
      for (const item of traceItems(ctx, rng, ["corners", "edges"], 6, requires, 8)) {
        if (item.kind !== "trace") throw new Error("kind");
        const t = trace(ctx.puzzle, { alg: item.scramble }, { pieceType: item.pieceType, buffer: item.buffer, scheme: ctx.scheme, policy: { orientedInPlace: "asTargets" } });
        if (!t.ok) throw new Error("trace");
        expect(t.value.targets).toEqual(item.answer);
        const kinds = new Set(t.value.cycles.map((c) => c.kind));
        if (requires === "no-breaks") expect(kinds.has("break") || kinds.has("orientation")).toBe(false);
        if (requires === "break") expect(kinds.has("break")).toBe(true);
        if (requires === "twist") expect(kinds.has("orientation")).toBe(true);
        expect(item.answer.length).toBeLessThanOrEqual(8);
      }
    }
    expect(() => scrambleFor(ctx, rng, "corners", "twist", 0)).toThrow();
  });

  it("parity items say yes exactly when the corner and edge target counts are odd", async () => {
    const ctx = await context();
    for (const item of parityItems(ctx, checkpointRng("parity", "p", 0), 12)) {
      if (item.kind !== "parity") throw new Error("kind");
      const c = trace(ctx.puzzle, { alg: item.scramble }, { pieceType: "corners", buffer: "UBL", scheme: ctx.scheme, policy: { orientedInPlace: "asTargets" } });
      const e = trace(ctx.puzzle, { alg: item.scramble }, { pieceType: "edges", buffer: "UR", scheme: ctx.scheme, policy: { orientedInPlace: "asTargets" } });
      if (!c.ok || !e.ok) throw new Error("trace");
      expect(c.value.targetCount % 2 === 1).toBe(item.answer);
      expect(e.value.targetCount % 2 === 1).toBe(item.answer);
    }
  });

  it("grades a setup by what it does: the table's setups pass, other legal setups pass, illegal ones fail with a reason", async () => {
    const ctx = await context();
    const corners = dataset("op-corners.UBL.json");
    const edges = dataset("op-edges.UR.json");
    for (const d of [corners, edges]) {
      for (const record of d.records) expect(gradeSetup(ctx.puzzle, d, record.target, record.setup), `${d.id} ${record.target}`).toEqual({ correct: true, reason: "legal" });
      for (const f of d.forbidden) expect(gradeSetup(ctx.puzzle, d, f.example.target, f.example.setup).correct, `${d.id} ${f.family}`).toBe(false);
    }
    // A legal but longer setup for UFR (corners): F then D D' is still F.
    expect(gradeSetup(ctx.puzzle, corners, "UFR", "F D D'")).toEqual({ correct: true, reason: "legal" });
    expect(gradeSetup(ctx.puzzle, corners, "UFR", "R")).toMatchObject({ correct: false });
    expect(gradeSetup(ctx.puzzle, corners, "UFR", "Q!")).toEqual({ correct: false, reason: "unreadable" });
    const items = setupItems(ctx, checkpointRng("op", "s", 0), corners, 6);
    expect(items).toHaveLength(6);
  });

  it("letter grading ignores spaces, commas and case", () => {
    expect(gradeLetters(["A", "B", "C"], "a b, c")).toBe(true);
    expect(gradeLetters("M", " m ")).toBe(true);
    expect(gradeLetters(["A", "B"], "BA")).toBe(false);
  });
});

describe("compareLetters", () => {
  it("sets typed letters against the right ones target by target and finds where it first went wrong", () => {
    const comparison = compareLetters(["A", "P", "X", "V", "F", "D"], "a p x c f d");
    expect(comparison.pairs.map((pair) => pair.match)).toEqual([true, true, true, false, true, true]);
    expect(comparison.firstDifference).toEqual({ position: 4, typed: "C", right: "V", match: false });
  });

  it("reads spaces, commas and case the way grading does", () => {
    expect(compareLetters(["A", "P", "X"], "A,p  X").firstDifference).toBeUndefined();
    expect(compareLetters("K", " k ").firstDifference).toBeUndefined();
  });

  it("shows targets you never typed, and letters typed past the end", () => {
    const short = compareLetters(["A", "P", "X"], "AP");
    expect(short.firstDifference).toEqual({ position: 3, typed: undefined, right: "X", match: false });
    const long = compareLetters(["A", "P"], "APX");
    expect(long.firstDifference).toEqual({ position: 3, typed: "X", right: undefined, match: false });
    expect(long.pairs).toHaveLength(3);
  });

  it("finds a difference exactly when gradeLetters says the answer is wrong", () => {
    const rng = checkpointRng("compare letters", "trace", 0);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWX";
    for (let run = 0; run < 300; run++) {
      const length = 1 + rng.int(9);
      const expected = Array.from({ length }, () => alphabet.charAt(rng.int(alphabet.length)));
      let typed = expected.join(rng.int(2) === 0 ? "" : " ");
      if (rng.int(3) === 0) typed = typed.replace(/[A-X]/, alphabet.charAt(rng.int(alphabet.length)));
      if (rng.int(4) === 0) typed = typed.slice(0, Math.max(1, typed.length - 1));
      if (rng.int(5) === 0) typed += alphabet.charAt(rng.int(alphabet.length));
      expect(compareLetters(expected, typed).firstDifference === undefined, `${expected.join("")} vs ${typed}`).toBe(gradeLetters(expected, typed));
    }
  });
});
