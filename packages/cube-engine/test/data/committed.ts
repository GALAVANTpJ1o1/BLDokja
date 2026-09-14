import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AlgDataset } from "../../src/data/alg-dataset.js";
import { ContentDatasetSchema, type ContentDataset } from "../../src/data/content-dataset.js";
import type { M2Dataset } from "../../src/data/m2-dataset.js";
import type { Puzzle } from "../../src/core/puzzle.js";
import { buildM2ThreeStyleParityDataset, buildThreeStyleParityDataset, type M2ThreeStyleParityDataset, type ThreeStyleParityDataset } from "../../src/data/three-style-parity.js";

/** Committed datasets under content/algs/3x3/, Zod-validated on read. Tests only: the engine never reads files. */

const dir = join(import.meta.dirname, "..", "..", "..", "..", "content", "algs", "3x3");
const cache = new Map<string, ContentDataset>();

export function committed(name: string): ContentDataset {
  let dataset = cache.get(name);
  if (dataset === undefined) {
    dataset = ContentDatasetSchema.parse(JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")));
    cache.set(name, dataset);
  }
  return dataset;
}

function algDataset(name: string): AlgDataset {
  const d = committed(name);
  if (d.kind !== "cycles" && d.kind !== "twists" && d.kind !== "flips") throw new Error(`${name} is not a 3-style dataset`);
  return d;
}

/** The Gate B 3-style datasets (D-022, D-023) and the M2 edges for DF (D-025). */
export function threeStyleDatasets(): { corners: AlgDataset; edges: AlgDataset; twists: AlgDataset; flips: AlgDataset; m2: M2Dataset } {
  const m2 = committed("m2-edges.DF");
  if (m2.kind !== "setups" || m2.method !== "m2") throw new Error("m2-edges.DF is not an M2 dataset");
  return { corners: algDataset("3style-corners.UFR"), edges: algDataset("3style-edges.UF"), twists: algDataset("3style-twists.UFR"), flips: algDataset("3style-flips.UF"), m2 };
}

/** The 3-style and M2 + 3-style parity datasets, built from the committed datasets (datasets.test checks the committed files equal these). */
export function threeStyleParities(puzzle: Puzzle): { parity: ThreeStyleParityDataset; m2Parity: M2ThreeStyleParityDataset } {
  const { corners, edges, twists, flips, m2 } = threeStyleDatasets();
  const parity = buildThreeStyleParityDataset(puzzle, { id: "3style-parity.UFR-UF", corners, edges, twists, flips });
  const m2Parity = buildM2ThreeStyleParityDataset(puzzle, { id: "m2-3style-parity.UFR-DF", corners, twists, edges: m2 });
  if (!parity.ok || !m2Parity.ok) throw new Error(JSON.stringify([parity, m2Parity]));
  return { parity: parity.value, m2Parity: m2Parity.value };
}
