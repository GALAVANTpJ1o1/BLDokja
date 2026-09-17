import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { verifyDataset, type AlgDataset } from "../../src/data/alg-dataset.js";
import { verifyOpCornerParityDataset } from "../../src/data/four-bld-parity.js";
import { ContentDatasetSchema, type ContentDataset } from "../../src/data/content-dataset.js";
import { verifySwapDataset, verifySwapParityDataset, verifyM2OpParityDataset, type SwapDataset } from "../../src/data/swap-dataset.js";
import { verifyOpParityDataset, verifyOpSetupsDataset, type OpSetupsDataset } from "../../src/data/op-dataset.js";
import { verifyM2ThreeStyleParityDataset, verifyThreeStyleParityDataset } from "../../src/data/three-style-parity.js";
import { m2OpSystem } from "../../src/methods/m2.js";
import { opSystem } from "../../src/methods/op.js";
import { threeStyleParities } from "./committed.js";
import { verifyLastLayerDataset } from "../../src/data/last-layer.js";

/**
 * Every committed alg dataset (BRIEF §5.4: "no unverified algorithm ships"). Each file is
 * Zod-validated and goes through its kind's verifier:
 * - 3-style (D-023): the intended effect recomputed from the case, each alg's whole-puzzle
 *   permutation, that it solves the case state, its counts and notation, full coverage in order;
 * - OP setups (D-024): the swap a verified symmetry image of the reference, the tables searched
 *   again, every alg's permutation equal to the buffer-target exchange plus the swap's side effect;
 * - OP parity (D-024): its effect derived from the two setups datasets it belongs with;
 * - M2 setups (D-025): the setups searched again, special algs checked against E·X, the odd/even
 *   rule and tempting setups derived again; M2/OP parity: its effect derived from its two datasets;
 * - 3-style parity (D-026): partners read off the alg, the effect recomputed from buffers and
 *   partners, the main alg the relabelled reference (or its searched conjugate for M2), tails rederived.
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
  "3style-parity.UFR-UF.json": 1,
  "m2-3style-parity.UFR-DF.json": 1,
  // 4BLD (D-038): one record per wing and per x-centre other than the buffer.
  "r2-wings.FDr.json": 23,
  "u2-xcenters.Ubr.json": 23,
  "r2-parity.FDr.json": 1,
  // 4BLD parity (D-041): U2's leftover, and OP corners' leftover on a 4x4.
  "u2-parity.Ubr.json": 1,
  "op-corner-parity.UBL.json": 1,
  "oll.json": 57,
  "pll.json": 21,
  "eo.json": 3,
  "co.json": 7,
  "corner-perm.json": 2,
  "edge-perm.json": 4,
};

function load(path: string): ContentDataset {
  const parsed = ContentDatasetSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(`${nameOf(path)}: ${parsed.error.message}`);
  return parsed.data;
}

const PARITY_PREFIX = { op: "op-parity", "m2-op": "m2op-parity", "3style": "3style-parity", "m2-3style": "m2-3style-parity" } as const;

function expectedName(dataset: ContentDataset): string {
  switch (dataset.kind) {
    case "cycles":
      return `3style-${dataset.pieceType}.${dataset.buffer}.json`;
    case "twists":
    case "flips":
      return `3style-${dataset.kind}.${dataset.buffer}.json`;
    case "setups":
      // op-corners.UBL, m2-edges.DF, r2-wings.FDr, u2-xcenters.Ubr: method, pieces, buffer sticker.
      return dataset.method === "op" ? `op-${dataset.pieceType}.${dataset.buffer}.json` : `${dataset.method}-${dataset.pieceType}.${dataset.buffer}.json`;
    case "parity":
      return `${PARITY_PREFIX[dataset.method]}.${dataset.buffers.corners}-${dataset.buffers.edges}.json`;
    case "swap-parity":
      return `${dataset.method}-parity.${dataset.buffer}.json`;
    case "corner-parity":
      return `op-corner-parity.${dataset.buffer}.json`;
    case "oll": case "pll": case "eo": case "co": case "corner-perm": case "edge-perm":
      return `${dataset.kind}.json`;
  }
}

describe("committed alg datasets", () => {
  it("include every Gate B dataset", () => {
    const names = files.map(nameOf);
    for (const name of Object.keys(REQUIRED)) expect(names, name).toContain(name);
  });

  it.each(files.map((f) => [nameOf(f), f]))("%s: schema-valid, every alg verified, full coverage", async (name, path) => {
    const dataset = load(path);
    const puzzle = await loadPuzzle(dataset.puzzle);
    expect(`${dataset.id}.json`).toBe(name);
    expect(name).toBe(expectedName(dataset));
    const required = REQUIRED[name];
    if (required !== undefined) expect(dataset.records).toHaveLength(required);
    expect(new Set(dataset.records.map((r) => r.id)).size).toBe(dataset.records.length);

    switch (dataset.kind) {
      case "oll": case "pll": case "eo": case "co": case "corner-perm": case "edge-perm":
        expect(verifyLastLayerDataset(puzzle, dataset)).toEqual([]);
        break;
      case "cycles":
      case "twists":
      case "flips":
        expect(verifyDataset(puzzle, dataset).slice(0, 5)).toEqual([]);
        break;
      case "setups":
        expect((dataset.method === "op" ? verifyOpSetupsDataset(puzzle, dataset) : verifySwapDataset(puzzle, dataset)).slice(0, 5)).toEqual([]);
        break;
      case "swap-parity": {
        // The leftover of an odd number of targets, checked against the setups dataset it belongs with.
        const setups = files.map(load).find((d): d is SwapDataset => d.kind === "setups" && d.method === dataset.method && d.buffer === dataset.buffer);
        if (setups === undefined) throw new Error(`${name}: ${dataset.method}-${dataset.buffer} setups aren't committed`);
        expect(verifySwapParityDataset(puzzle, dataset, setups).slice(0, 5)).toEqual([]);
        break;
      }
      case "corner-parity": {
        // Checked against the OP corners dataset whose swap leaves it; that dataset is a 3x3 file, used on a 4x4.
        const corners = files.map(load).find((d): d is OpSetupsDataset => d.kind === "setups" && d.method === "op" && d.pieceType === "corners" && d.buffer === dataset.buffer);
        if (corners === undefined) throw new Error(`${name}: op-corners.${dataset.buffer} isn't committed`);
        expect(verifyOpCornerParityDataset(puzzle, dataset, corners).slice(0, 5)).toEqual([]);
        break;
      }
      case "parity": {
        // A parity dataset is checked against the committed datasets it belongs with.
        const all = files.map(load);
        const need = <T,>(found: T | undefined, what: string): T => {
          if (found === undefined) throw new Error(`${name}: ${what} isn't committed`);
          return found;
        };
        const op = (typeId: "corners" | "edges", buffer: string) => need(all.find((d): d is OpSetupsDataset => d.kind === "setups" && d.method === "op" && d.pieceType === typeId && d.buffer === buffer), `op-${typeId}.${buffer}`);
        const m2 = (buffer: string) => need(all.find((d): d is SwapDataset => d.kind === "setups" && d.method === "m2" && d.buffer === buffer), `m2-edges.${buffer}`);
        const three = (kind: AlgDataset["kind"], typeId: "corners" | "edges", buffer: string) =>
          need(all.find((d): d is AlgDataset => d.kind === kind && d.pieceType === typeId && d.buffer === buffer), `3style-${kind}.${buffer}`);
        const { corners: cb, edges: eb } = dataset.buffers;
        switch (dataset.method) {
          case "op":
            expect(verifyOpParityDataset(puzzle, dataset, op("corners", cb), op("edges", eb)).slice(0, 5)).toEqual([]);
            break;
          case "m2-op":
            expect(verifyM2OpParityDataset(puzzle, dataset, op("corners", cb), m2(eb)).slice(0, 5)).toEqual([]);
            break;
          case "3style":
            expect(verifyThreeStyleParityDataset(puzzle, dataset, { corners: three("cycles", "corners", cb), edges: three("cycles", "edges", eb), twists: three("twists", "corners", cb), flips: three("flips", "edges", eb) }).slice(0, 5)).toEqual([]);
            break;
          case "m2-3style":
            expect(verifyM2ThreeStyleParityDataset(puzzle, dataset, { corners: three("cycles", "corners", cb), twists: three("twists", "corners", cb), edges: m2(eb) }).slice(0, 5)).toEqual([]);
            break;
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

  it("the committed 3-style parity datasets are exactly what the builders make from the committed 3-style and M2 datasets", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { parity, m2Parity } = threeStyleParities(puzzle);
    const committed = Object.fromEntries(files.map((f) => [nameOf(f), f]));
    for (const dataset of [parity, m2Parity]) {
      const path = committed[`${dataset.id}.json`];
      if (path === undefined) throw new Error(`${dataset.id} not committed`);
      expect(load(path), dataset.id).toEqual(dataset);
    }
  });
});
