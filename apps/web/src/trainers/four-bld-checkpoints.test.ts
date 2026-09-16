import { createRng, loadPuzzle } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { algDatasets } from "@/content/algs";
import { readerFor4x4 } from "@/lib/reader-4x4";
import { fourLetterItems, fourMemo, fourParityItems, fourSetupItems, fourTraceItems, gradeFourMemo, gradeFourSetup, sameLook } from "./four-bld-checkpoints";
import { centreSession, traceOf } from "./four-bld";

/** The 4BLD checkpoints: every generated answer is the engine's, and graders accept every right answer. */

describe("4BLD checkpoint items", () => {
  it("letters come from the scheme, one per sticker, without repeats", async () => {
    const reader = readerFor4x4(await loadPuzzle("4x4x4"));
    const items = fourLetterItems(reader, createRng("letters"), ["wings", "xcenters"], 12);
    expect(items).toHaveLength(12);
    expect(new Set(items.map((i) => (i.kind === "four-letter" ? i.sticker : ""))).size).toBe(12);
    for (const item of items) if (item.kind === "four-letter") expect(reader.scheme.letters[item.pieces]?.[item.sticker]).toBe(item.answer);
  });

  it("traces are short, the engine's own memo is accepted, and a wrong memo isn't", async () => {
    const reader = readerFor4x4(await loadPuzzle("4x4x4"));
    const items = fourTraceItems(reader, createRng("trace"), ["xcenters", "wings", "corners"], 9, 8);
    for (const item of items) {
      if (item.kind !== "four-trace") throw new Error("kind");
      expect(item.answer.length).toBeGreaterThan(0);
      expect(item.answer.length).toBeLessThanOrEqual(8);
      expect(gradeFourMemo(reader, item, item.answer.join(" ")), `${item.pieces} ${item.scramble}`).toBe(true);
      expect(gradeFourMemo(reader, item, item.answer.slice(0, -1).join("")), `${item.pieces} short`).toBe(false);
    }
  });

  it("an x-centre memo is right whichever valid slot you pick at each step", async () => {
    const reader = readerFor4x4(await loadPuzzle("4x4x4"));
    const scramble = "2R 2U2 2F' 2L";
    const item = { kind: "four-trace" as const, pieces: "xcenters" as const, buffer: "Ubr", scramble, answer: fourMemo(reader, scramble, "xcenters") ?? [] };
    // Walk it taking the last choice every time: a different memo from the engine's.
    const session = centreSession(reader, scramble);
    if (session === undefined) throw new Error("session");
    const other: string[] = [];
    let differs = false;
    for (let step = session.next(); step !== undefined; step = session.next()) {
      const letter = step.letters[step.letters.length - 1] ?? "";
      if (step.letters.length > 1) differs = true;
      session.answer(letter);
      other.push(letter);
    }
    expect(differs).toBe(true);
    expect(gradeFourMemo(reader, item, item.answer.join(""))).toBe(true);
    expect(gradeFourMemo(reader, item, other.join(""))).toBe(true);
  });

  it("parity answers are whether the count is odd, and both answers turn up", async () => {
    const reader = readerFor4x4(await loadPuzzle("4x4x4"));
    const items = fourParityItems(reader, createRng("parity"), ["wings", "corners"], 16);
    const answers = new Set<boolean>();
    for (const item of items) {
      if (item.kind !== "four-parity") throw new Error("kind");
      expect(item.answer).toBe((traceOf(reader, item.scramble, item.pieces)?.targetStickers.length ?? 0) % 2 === 1);
      answers.add(item.answer);
    }
    expect(answers.size).toBe(2);
  });

  it("the table's setup is accepted for every r2 and U2 target, and so is any other setup that works", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const reader = readerFor4x4(puzzle);
    const { r2Wings, u2Centres } = algDatasets();
    for (const dataset of [r2Wings, u2Centres]) {
      for (const item of fourSetupItems(reader, createRng(dataset.id), dataset, 30)) {
        if (item.kind !== "four-setup") throw new Error("kind");
        expect(gradeFourSetup(puzzle, dataset, item.target, item.answer).correct, `${dataset.id} ${item.target}`).toBe(true);
        // No setup at all only works on the swap slot itself, which these items leave out.
        expect(gradeFourSetup(puzzle, dataset, item.target, "").correct).toBe(false);
      }
    }
    // Setups the table doesn't list are graded by what they do. A D turn after U2's own setup for Lub changes
    // the setup but not the shot, since D and the U2 swap don't share a layer. A U turn first moves the buffer.
    expect(gradeFourSetup(puzzle, u2Centres, "Lub", "2F 2U2 2F' D").correct).toBe(true);
    expect(gradeFourSetup(puzzle, u2Centres, "Lub", "U 2F 2U2 2F'").correct).toBe(false);
  });

  it("refuses setups that damage the cube, like the dataset's own tempting shortcuts", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const { r2Wings } = algDatasets();
    for (const tempting of r2Wings.tempting.slice(0, 10)) expect(gradeFourSetup(puzzle, r2Wings, tempting.target, tempting.setup).correct, `${tempting.target} ${tempting.setup}`).toBe(false);
    expect(gradeFourSetup(puzzle, r2Wings, "UBl", "not a move").reason).toBe("unreadable");
  });

  it("compares x-centres by colour and everything else exactly", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    expect(sameLook(puzzle, "U2", "U2")).toBe(true);
    // A U turn moves U-face x-centres among themselves (invisible) but also the corners (visible).
    expect(sameLook(puzzle, "U", "")).toBe(false);
    // A whole-cube turn moves every piece: nothing looks the same.
    expect(sameLook(puzzle, "x", "")).toBe(false);
    // Four quarter turns of an inner slice put every sticker back.
    expect(sameLook(puzzle, "2R 2R 2R 2R", "")).toBe(true);
  });
});
