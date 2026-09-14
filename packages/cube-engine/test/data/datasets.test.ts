import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { AlgDatasetSchema, verifyDataset } from "../../src/data/alg-dataset.js";

/**
 * Every committed alg dataset (BRIEF §5.4: "no unverified algorithm ships"). Each file is
 * Zod-validated, and every record and every alg in it goes through verifyDataset: the intended
 * effect recomputed from the case, each alg's whole-puzzle permutation, that it solves the case
 * state, its counts and notation, and complete coverage in canonical order (D-023).
 */

const contentDir = join(import.meta.dirname, "..", "..", "..", "..", "content", "algs");

function datasetFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return datasetFiles(path);
    return entry.name.endsWith(".json") ? [path] : [];
  });
}

const files = datasetFiles(contentDir);

/** The Gate B datasets (D-022) that must exist, with their record counts. */
const REQUIRED: Readonly<Record<string, number>> = {
  "3style-corners.UFR.json": 378,
  "3style-edges.UF.json": 440,
  "3style-twists.UFR.json": 14,
  "3style-flips.UF.json": 11,
};

describe("committed alg datasets", () => {
  it("include every Gate B dataset", () => {
    const names = files.map((f) => f.split(/[\\/]/).pop());
    for (const name of Object.keys(REQUIRED)) expect(names, name).toContain(name);
  });

  it.each(files.map((f) => [f.split(/[\\/]/).pop() ?? f, f]))("%s: schema-valid, every alg verified, full coverage", async (name, path) => {
    const puzzle = await loadPuzzle("3x3x3");
    const parsed = AlgDatasetSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) throw new Error(`${name}: ${parsed.error.message}`);
    const dataset = parsed.data;
    expect(`${dataset.id}.json`).toBe(name);
    expect(name).toBe(`3style-${dataset.kind === "cycles" ? dataset.pieceType : dataset.kind}.${dataset.buffer}.json`);
    const required = REQUIRED[name];
    if (required !== undefined) expect(dataset.records).toHaveLength(required);
    expect(new Set(dataset.records.map((r) => r.id)).size).toBe(dataset.records.length);
    expect(verifyDataset(puzzle, dataset).slice(0, 5)).toEqual([]);
  });
});
