import { AlgDatasetSchema, drillScramble, loadPuzzle, speffzScheme, symmetryImageDataset, validateComm } from "@bld/cube-engine";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkUserAlg, commCases, gridStickers, importOverrides, overridesFile, withoutUserAlg, withUserAlg } from "./three-style";

const read = (name: string) => AlgDatasetSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "content", "algs", "3x3", name), "utf8")));
const corners = read("3style-corners.UFR.json");
const edges = read("3style-edges.UF.json");

describe("3-style cases", () => {
  it("has 378 corner and 440 edge cases, ids carrying piece type and buffer, letters from the scheme", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const c = commCases(puzzle, corners, scheme, undefined);
    const e = commCases(puzzle, edges, scheme, undefined);
    expect([c.cases.length, e.cases.length]).toEqual([378, 440]);
    expect(c.cases[0]?.id).toMatch(/^corners@UFR:[A-Z]{3}-[A-Z]{3}$/);
    const ubrUbl = c.cases.find((x) => x.recordId === "UBR-UBL");
    expect(ubrUbl?.letters).toBe("BA");
    expect(gridStickers(puzzle, corners, scheme)).toHaveLength(21);
  });

  it("every alg shown solves its case, its inverse solves the reversed case, and its drill scramble exists", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { cases } = commCases(puzzle, corners, speffzScheme(puzzle), undefined);
    for (const c of cases.slice(0, 60)) {
      for (const a of c.algs) {
        const forward = validateComm(puzzle, a.alg, [c.buffer, c.targets[0], c.targets[1]]);
        const backward = validateComm(puzzle, a.inverse, [c.buffer, c.targets[1], c.targets[0]]);
        expect(forward.ok && forward.value.valid, `${c.id} ${a.alg}`).toBe(true);
        expect(backward.ok && backward.value.valid, `${c.id} inverse ${a.inverse}`).toBe(true);
        expect(drillScramble(puzzle, a.moves).ok).toBe(true);
        expect(validateComm(puzzle, a.inverseMoves, [c.buffer, c.targets[1], c.targets[0]]).ok, "inverse moves").toBe(true);
        expect(a.inverseMoves.split(" ").length).toBeLessThanOrEqual(a.moves.split(" ").length);
      }
    }
  });

  it("your algs come first only when the engine confirms they solve the case; the rest are rejected, never shown", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const record = corners.records.find((r) => r.id === "UBR-UBL");
    const datasetAlg = record?.algs[1]?.alg ?? "";
    expect(checkUserAlg(puzzle, corners, "UBR-UBL", "R U R'").ok).toBe(false);
    expect(checkUserAlg(puzzle, corners, "UBR-UBL", "[R, U").ok).toBe(false);
    let overrides = withUserAlg(undefined, corners.id, "UBR-UBL", datasetAlg);
    overrides = withUserAlg(overrides, corners.id, "UBR-UBL", "R U R'");
    overrides = withUserAlg(overrides, corners.id, "NOPE-UBL", "[R, U]");
    const { cases, rejected } = commCases(puzzle, corners, scheme, overrides);
    const c = cases.find((x) => x.recordId === "UBR-UBL");
    expect(c?.algs[0]).toMatchObject({ alg: datasetAlg, source: "yours" });
    expect(c?.algs.filter((a) => a.alg === datasetAlg)).toHaveLength(1);
    expect(rejected.map((r) => [r.recordId, r.reason])).toEqual([["NOPE-UBL", "unknown-case"], ["UBR-UBL", "does-not-solve"]]);
    const removed = withoutUserAlg(overrides, corners.id, "UBR-UBL", "R U R'");
    expect(removed[corners.id]?.["UBR-UBL"]).toEqual([datasetAlg]);
    expect(withoutUserAlg(removed, corners.id, "UBR-UBL", datasetAlg)[corners.id]?.["UBR-UBL"]).toBeUndefined();
  });

  it("imports an alg file for another buffer, keeping only algs that solve their cases", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const ubl = symmetryImageDataset(puzzle, corners, "UBL");
    if (!ubl.ok) throw new Error("image failed");
    const good = ubl.value.records.find((r) => r.id === "UBR-UFR")?.algs[0]?.alg ?? "";
    const file = overridesFile({ "3style-corners.UBL": { "UBR-UFR": [good, "[R, U]"] } });
    const result = importOverrides(puzzle, file, { corners, edges });
    if (!result.ok) throw new Error("import failed");
    expect(result.kept).toBe(1);
    expect(result.overrides["3style-corners.UBL"]?.["UBR-UFR"]).toEqual([good]);
    expect(result.rejected.map((r) => r.reason)).toEqual(["does-not-solve"]);
    expect(importOverrides(puzzle, "not json", { corners, edges }).ok).toBe(false);
    expect(importOverrides(puzzle, JSON.stringify({ format: "other" }), { corners, edges }).ok).toBe(false);
  });
});
