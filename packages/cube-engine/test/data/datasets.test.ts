import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { verifyDataset } from "../../src/data/alg-dataset.js";
import { ContentDatasetSchema, type ContentDataset } from "../../src/data/content-dataset.js";
import { verifyM2Dataset, verifyM2OpParityDataset, type M2Dataset } from "../../src/data/m2-dataset.js";
import { verifyOpParityDataset, verifyOpSetupsDataset, type OpSetupsDataset } from "../../src/data/op-dataset.js";
import { m2OpSystem } from "../../src/methods/m2.js";
import { opSystem } from "../../src/methods/op.js";

/**
 * Every committed alg dataset (BRIEF §5.4: "no unverified algorithm ships"). Each file is
 * Zod-validated and goes through its kind's verifier:
 * - 3-style (D-023): the intended effect recomputed from the case, each alg's whole-puzzle
 *   permutation, that it solves the case state, its counts and notation, full coverage in order;
 * - OP setups (D-024): the swap a verified symmetry image of the reference, the tables searched
 *   again, every alg's permutation equal to the buffer-target exchange plus the swap's side effect;
 * - OP parity (D-024): its effect derived from the two setups datasets it belongs with;
 * - M2 setups (D-025): the setups searched again, special algs checked against E·X, the odd/even
 *   rule and tempting setups derived again; M2/OP parity: its effect derived from its two datasets.
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
const nameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** The Gate B datasets (D-022) that must exist, with their record counts. */
const REQUIRED: Readonly<Record<string, number>> = {
  "3style-corners.UFR.json": 378,
  "3style-edges.UF.json": 440,
  "3style-twists.UFR.json": 14,
  "3style-flips.UF.json": 11,
  "op-corners.UBL.json": 21,
  "op-edges.UR.json": 22,
  "op-parity.UBL-UR.json": 1,
  "m2-edges.DF.json": 22,
  "m2op-parity.UBL-DF.json": 1,
};

function load(path: string): ContentDataset {
  const parsed = ContentDatasetSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(`${nameOf(path)}: ${parsed.error.message}`);
  return parsed.data;
}

function expectedName(dataset: ContentDataset): string {
  switch (dataset.kind) {
    case "cycles":
      return `3style-${dataset.pieceType}.${dataset.buffer}.json`;
    case "twists":
    case "flips":
      return `3style-${dataset.kind}.${dataset.buffer}.json`;
    case "setups":
      return dataset.method === "op" ? `op-${dataset.pieceType}.${dataset.buffer}.json` : `m2-edges.${dataset.buffer}.json`;
    case "parity":
      return `${dataset.method === "op" ? "op-parity" : "m2op-parity"}.${dataset.buffers.corners}-${dataset.buffers.edges}.json`;
  }
}

describe("committed alg datasets", () => {
  it("include every Gate B dataset", () => {
    const names = files.map(nameOf);
    for (const name of Object.keys(REQUIRED)) expect(names, name).toContain(name);
  });

  it.each(files.map((f) => [nameOf(f), f]))("%s: schema-valid, every alg verified, full coverage", async (name, path) => {
    const puzzle = await loadPuzzle("3x3x3");
    const dataset = load(path);
    expect(`${dataset.id}.json`).toBe(name);
    expect(name).toBe(expectedName(dataset));
    const required = REQUIRED[name];
    if (required !== undefined) expect(dataset.records).toHaveLength(required);
    expect(new Set(dataset.records.map((r) => r.id)).size).toBe(dataset.records.length);

    switch (dataset.kind) {
      case "cycles":
      case "twists":
      case "flips":
        expect(verifyDataset(puzzle, dataset).slice(0, 5)).toEqual([]);
        break;
      case "setups":
        expect((dataset.method === "op" ? verifyOpSetupsDataset(puzzle, dataset) : verifyM2Dataset(puzzle, dataset)).slice(0, 5)).toEqual([]);
        break;
      case "parity": {
        // A parity dataset is checked against the two committed setups datasets it names.
        const all = files.map(load);
        const op = all.filter((d): d is OpSetupsDataset => d.kind === "setups" && d.method === "op");
        const m2 = all.filter((d): d is M2Dataset => d.kind === "setups" && d.method === "m2");
        const corners = op.find((d) => d.pieceType === "corners" && d.buffer === dataset.buffers.corners);
        if (dataset.method === "op") {
          const edges = op.find((d) => d.pieceType === "edges" && d.buffer === dataset.buffers.edges);
          if (corners === undefined || edges === undefined) throw new Error(`${name}: its setups datasets aren't committed`);
          expect(verifyOpParityDataset(puzzle, dataset, corners, edges).slice(0, 5)).toEqual([]);
        } else {
          const edges = m2.find((d) => d.buffer === dataset.buffers.edges);
          if (corners === undefined || edges === undefined) throw new Error(`${name}: its setups datasets aren't committed`);
          expect(verifyM2OpParityDataset(puzzle, dataset, corners, edges).slice(0, 5)).toEqual([]);
        }
        break;
      }
    }
  });

  it("the committed OP datasets are exactly what opSystem builds at runtime for (UBL, UR)", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const system = opSystem(puzzle, { cornerBuffer: "UBL", edgeBuffer: "UR" });
    if (!system.ok) throw new Error(JSON.stringify(system.error));
    const committed = Object.fromEntries(files.map((f) => [nameOf(f), f]));
    for (const dataset of [system.value.corners, system.value.edges, system.value.parity]) {
      const path = committed[`${dataset.id}.json`];
      if (path === undefined) throw new Error(`${dataset.id} not committed`);
      expect(load(path), dataset.id).toEqual(dataset);
    }
  });

  it("the committed M2 datasets are exactly what m2OpSystem builds at runtime for (UBL, DF), whose corners are the OP/OP ones", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const system = m2OpSystem(puzzle, { cornerBuffer: "UBL", edgeBuffer: "DF" });
    if (!system.ok) throw new Error(JSON.stringify(system.error));
    const committed = Object.fromEntries(files.map((f) => [nameOf(f), f]));
    for (const dataset of [system.value.corners, system.value.edges, system.value.parity]) {
      const path = committed[`${dataset.id}.json`];
      if (path === undefined) throw new Error(`${dataset.id} not committed`);
      expect(load(path), dataset.id).toEqual(dataset);
    }
  });
});
