/**
 * Generates the verified CFOP last-layer datasets in content/algs/cfop/ (DECISIONS D-046): full OLL
 * (57 cases), full PLL (21 cases), and the four 2-look sub-steps (EO 3, CO 7, corner permutation 2,
 * edge-perm-only 4). Every case is enumerated from first principles (src/data/last-layer.ts), not
 * copied from a reference sheet; every algorithm comes from cubing.js's own solver and is re-verified
 * against the case before anything is written, exactly like scripts/generate-datasets.ts.
 *
 *   pnpm cfop:generate            write the files
 *   pnpm cfop:generate --check    regenerate in memory; exit 1 if any committed file differs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { KPattern } from "cubing/kpuzzle";
import { Alg } from "cubing/alg";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import { cancelMoves, expandNodes, formatMoves } from "../src/commutator/expand.js";
import { moveCounts } from "../src/commutator/metrics.js";
import { formatAlg, parseAlg } from "../src/commutator/parse.js";
import { loadPuzzle, type Puzzle } from "../src/core/puzzle.js";
import type { AlgEntry } from "../src/data/alg-dataset.js";
import {
  coPattern,
  cornerPermPattern,
  edgePermPattern,
  enumerateCo,
  enumerateCornerPermOnly,
  enumerateEdgePermOnly,
  enumerateEo,
  enumerateOll,
  enumeratePll,
  eoPattern,
  ollPattern,
  pllPattern,
  verifyLastLayerDataset,
  type CoDataset,
  type CornerPermDataset,
  type EdgePermDataset,
  type EoDataset,
  type LastLayerDataset,
  type OllDataset,
  type PllDataset,
} from "../src/data/last-layer.js";
import { ENGINE_VERSION } from "../src/version.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "content", "algs", "cfop");

/** cubing.js's solution for a last-layer state, as a dataset entry — identical shape to generate-datasets.ts's solverEntry. */
async function solverEntry(puzzle: Puzzle, state: KPattern): Promise<AlgEntry> {
  const solution = new Alg(await experimentalSolve3x3x3IgnoringCenters(state)).toString();
  const parsed = parseAlg(puzzle.id, solution);
  if (!parsed.ok) throw new Error(`solver output "${solution}" doesn't parse: ${JSON.stringify(parsed.error)}`);
  const moves = cancelMoves(puzzle.id, expandNodes(parsed.value.nodes));
  const reparsed = parseAlg(puzzle.id, formatMoves(moves));
  if (!reparsed.ok) throw new Error("cancelled solver output doesn't parse");
  const { etm, qtm, htm, stm } = moveCounts(puzzle.id, moves);
  return { alg: formatAlg(reparsed.value), moves: formatMoves(moves), etm, qtm, htm, stm, source: "cubing-solver" };
}

async function ollDataset(puzzle: Puzzle): Promise<OllDataset> {
  const records: OllDataset["records"] = [];
  for (const kase of enumerateOll()) {
    const state = ollPattern(puzzle, kase);
    records.push({ id: kase.id, corners: [...kase.corners], edges: [...kase.edges], algs: [await solverEntry(puzzle, state)] });
  }
  return { format: "bld-platform/last-layer-dataset", version: 1, id: "oll", puzzle: "3x3x3", kind: "oll", generatedBy: { engine: ENGINE_VERSION }, records };
}

async function pllDataset(puzzle: Puzzle): Promise<PllDataset> {
  const records: PllDataset["records"] = [];
  for (const kase of enumeratePll()) {
    const state = pllPattern(puzzle, kase);
    records.push({ id: kase.id, corners: [...kase.corners], edges: [...kase.edges], algs: [await solverEntry(puzzle, state)] });
  }
  return { format: "bld-platform/last-layer-dataset", version: 1, id: "pll", puzzle: "3x3x3", kind: "pll", generatedBy: { engine: ENGINE_VERSION }, records };
}

async function eoDataset(puzzle: Puzzle): Promise<EoDataset> {
  const records: EoDataset["records"] = [];
  for (const kase of enumerateEo()) {
    const state = eoPattern(puzzle, kase);
    records.push({ id: kase.id, edges: [...kase.edges], algs: [await solverEntry(puzzle, state)] });
  }
  return { format: "bld-platform/last-layer-dataset", version: 1, id: "eo", puzzle: "3x3x3", kind: "eo", generatedBy: { engine: ENGINE_VERSION }, records };
}

async function coDataset(puzzle: Puzzle): Promise<CoDataset> {
  const records: CoDataset["records"] = [];
  for (const kase of enumerateCo()) {
    const state = coPattern(puzzle, kase);
    records.push({ id: kase.id, corners: [...kase.corners], algs: [await solverEntry(puzzle, state)] });
  }
  return { format: "bld-platform/last-layer-dataset", version: 1, id: "co", puzzle: "3x3x3", kind: "co", generatedBy: { engine: ENGINE_VERSION }, records };
}

async function cornerPermDataset(puzzle: Puzzle): Promise<CornerPermDataset> {
  const records: CornerPermDataset["records"] = [];
  for (const kase of enumerateCornerPermOnly()) {
    const state = cornerPermPattern(puzzle, kase);
    records.push({ id: kase.id, corners: [...kase.corners], algs: [await solverEntry(puzzle, state)] });
  }
  return { format: "bld-platform/last-layer-dataset", version: 1, id: "corner-perm", puzzle: "3x3x3", kind: "corner-perm", generatedBy: { engine: ENGINE_VERSION }, records };
}

async function edgePermDataset(puzzle: Puzzle): Promise<EdgePermDataset> {
  const records: EdgePermDataset["records"] = [];
  for (const kase of enumerateEdgePermOnly()) {
    const state = edgePermPattern(puzzle, kase);
    records.push({ id: kase.id, edges: [...kase.edges], algs: [await solverEntry(puzzle, state)] });
  }
  return { format: "bld-platform/last-layer-dataset", version: 1, id: "edge-perm", puzzle: "3x3x3", kind: "edge-perm", generatedBy: { engine: ENGINE_VERSION }, records };
}

/** Every CFOP last-layer dataset as the exact file text to commit, verified. */
export async function generateCfopDatasets(): Promise<Map<string, string>> {
  const puzzle = await loadPuzzle("3x3x3");
  const files = new Map<string, string>();
  const write = (dataset: LastLayerDataset) => {
    files.set(`${dataset.id}.json`, `${JSON.stringify(dataset, null, 2)}\n`);
  };
  const builders: (() => Promise<LastLayerDataset>)[] = [
    () => ollDataset(puzzle),
    () => pllDataset(puzzle),
    () => eoDataset(puzzle),
    () => coDataset(puzzle),
    () => cornerPermDataset(puzzle),
    () => edgePermDataset(puzzle),
  ];
  for (const build of builders) {
    const started = performance.now();
    const dataset = await build();
    const problems = verifyLastLayerDataset(puzzle, dataset);
    if (problems.length > 0) throw new Error(`${dataset.id} failed verification: ${JSON.stringify(problems.slice(0, 5))}`);
    write(dataset);
    console.error(`${dataset.id}: ${dataset.records.length} records verified (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  }
  return files;
}

const normalise = (text: string) => text.replace(/\r\n/g, "\n");

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const files = await generateCfopDatasets();
  if (check) {
    const stale = [...files].filter(([name, text]) => {
      const path = join(OUT_DIR, name);
      return !existsSync(path) || normalise(readFileSync(path, "utf8")) !== text;
    });
    if (stale.length > 0) {
      console.error(`stale or missing: ${stale.map(([name]) => name).join(", ")}; run pnpm cfop:generate`);
      process.exitCode = 1;
    } else {
      console.error("all CFOP datasets match a fresh generation");
    }
  } else {
    for (const [name, text] of files) {
      const path = join(OUT_DIR, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
    console.error(`wrote ${files.size} CFOP datasets to content/algs/cfop/`);
  }
  // cubing.js's solver keeps a worker alive; nothing else is pending.
  process.exit();
}

if (process.argv[1]?.endsWith("generate-cfop-datasets.ts") === true) await main();
