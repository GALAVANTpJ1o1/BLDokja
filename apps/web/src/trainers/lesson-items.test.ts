import { createRng, loadPuzzle, speffzScheme, trace } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { algDatasets } from "@/content/algs";
import { gradeSwapSetup } from "./effects";
import { commBuildItems, commCaseItems, commExpandItems, gradeCommBuild, gradeExpansion, m2SetupItems, m2SpecialItems, mistakeItems, mistakeSignature } from "./lesson-items";

/** Lessons 16–23's checkpoints: answers from the engine, graders that accept anything that works. */

describe("M2 items", () => {
  it("every table setup grades right, and a missing setup grades wrong", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { m2Edges } = algDatasets();
    for (const item of m2SetupItems(speffzScheme(puzzle), createRng("m2"), m2Edges, 30)) {
      if (item.kind !== "m2-setup") throw new Error("kind");
      expect(gradeSwapSetup(puzzle, m2Edges, item.target, item.answer).correct, item.target).toBe(true);
      expect(gradeSwapSetup(puzzle, m2Edges, item.target, "").correct).toBe(false);
    }
    // The dataset's tempting shortcuts are refused.
    for (const tempting of m2Edges.tempting) expect(gradeSwapSetup(puzzle, m2Edges, tempting.target, tempting.setup).correct, `${tempting.target} ${tempting.setup}`).toBe(false);
  });

  it("special cases: the partner's alg on an odd step, the target's own on an even one", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { m2Edges } = algDatasets();
    const items = m2SpecialItems(speffzScheme(puzzle), createRng("special"), m2Edges, 8);
    expect(items).toHaveLength(8);
    for (const item of items) {
      if (item.kind !== "m2-special") throw new Error("kind");
      expect(item.answer).toBe(item.position === "even" ? item.target : m2Edges.oddStepRule.find((r) => r.target === item.target)?.shootAs);
    }
  });
});

describe("commutator items", () => {
  it("expansions: the cancelled moves are right, so is the written-out commutator, and a wrong order isn't", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { threeStyleCorners } = algDatasets();
    const items = commExpandItems(createRng("expand"), threeStyleCorners, 6);
    expect(items.length).toBe(6);
    for (const item of items) {
      if (item.kind !== "comm-expand") throw new Error("kind");
      expect(gradeExpansion(puzzle, item, item.answer)).toBe(true);
      expect(gradeExpansion(puzzle, item, item.comm)).toBe(true);
      expect(gradeExpansion(puzzle, item, item.answer.split(" ").reverse().join(" "))).toBe(false);
    }
  });

  it("case recognition: the two letters are what tracing the case from the buffer gives", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const { threeStyleCorners, threeStyleEdges } = algDatasets();
    for (const dataset of [threeStyleCorners, threeStyleEdges]) {
      const items = commCaseItems(puzzle, scheme, createRng(dataset.id), dataset, 5);
      expect(items).toHaveLength(5);
      for (const item of items) {
        if (item.kind !== "comm-case") throw new Error("kind");
        const traced = trace(puzzle, { alg: item.scramble }, { pieceType: item.pieces, buffer: item.buffer, scheme, policy: { orientedInPlace: "separate" } });
        expect(traced.ok && traced.value.targets).toEqual([...item.answer]);
      }
    }
  });

  it("building a comm: the dataset's comm is right, its inverse isn't, and so is any other comm that solves the case", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { threeStyleCorners } = algDatasets();
    const items = commBuildItems(speffzScheme(puzzle), createRng("build"), threeStyleCorners, 5);
    for (const item of items) {
      if (item.kind !== "comm-build") throw new Error("kind");
      expect(gradeCommBuild(puzzle, threeStyleCorners, item, item.answer), item.recordId).toBe(true);
      const record = threeStyleCorners.records.find((r) => r.id === item.recordId);
      for (const other of record?.algs.slice(1) ?? []) expect(gradeCommBuild(puzzle, threeStyleCorners, item, other.alg)).toBe(true);
      expect(gradeCommBuild(puzzle, threeStyleCorners, item, "R U R' U'")).toBe(false);
    }
  });
});

describe("mistake items", () => {
  it("each mistake leaves its own signature, and every kind turns up", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { opCorners, opEdges, opParity } = algDatasets();
    const items = mistakeItems(puzzle, speffzScheme(puzzle), createRng("mistakes"), { corners: opCorners, edges: opEdges, parity: opParity }, 12);
    const kinds = new Set<string>();
    for (const item of items) {
      if (item.kind !== "mistake") throw new Error("kind");
      expect(mistakeSignature(puzzle, `${item.scramble} ${item.executed}`)).toBe(item.answer);
      kinds.add(item.answer);
    }
    expect([...kinds].sort()).toEqual(["letters", "parity", "undo"]);
  });
});
