/**
 * Generates the verified alg datasets in content/algs/ (DECISIONS D-022 to D-026, D-038).
 *
 *   pnpm engine:generate            write the files
 *   pnpm engine:generate --check    regenerate in memory; exit 1 if any committed file differs
 *
 * `3x3/` holds the 3BLD sets; `4x4/` holds r2 wings and U2 x-centres. Output is deterministic: records
 * in canonical case order, no timestamps. Every record passes its verifier before anything is written;
 * if one doesn't, nothing is written.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Alg } from "cubing/alg";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import {
  buildCatalogue,
  buildOrientationCatalogue,
  DEFAULT_COMM_BOUNDS,
  DEFAULT_ORIENTATION_BOUNDS,
  type CommSearchBounds,
} from "../src/commutator/catalogue.js";
import { cancelMoves, expandNodes, formatMoves } from "../src/commutator/expand.js";
import { moveCounts } from "../src/commutator/metrics.js";
import { searchOrientationAlgs } from "../src/commutator/orientation-search.js";
import { formatAlg, parseAlg } from "../src/commutator/parse.js";
import { searchComms } from "../src/commutator/search.js";
import { orientationPairPattern } from "../src/commutator/validate.js";
import { loadPuzzle, type Puzzle } from "../src/core/puzzle.js";
import { algEntry, AlgDatasetSchema, buildRecord, entryForAlg, verifyDataset, type AlgDataset, type AlgEntry } from "../src/data/alg-dataset.js";
import { ContentDatasetSchema } from "../src/data/content-dataset.js";
import type { SwapDataset, M2OpParityDataset } from "../src/data/swap-dataset.js";
import type { OpParityDataset, OpSetupsDataset } from "../src/data/op-dataset.js";
import {
  buildM2ThreeStyleParityDataset,
  buildThreeStyleParityDataset,
  verifyM2ThreeStyleParityDataset,
  verifyThreeStyleParityDataset,
  type M2ThreeStyleParityDataset,
  type ThreeStyleParityDataset,
} from "../src/data/three-style-parity.js";
import { SPECIAL_BOUNDS } from "../src/methods/m2-search.js";
import { m2OpSystem } from "../src/methods/m2.js";
import { referenceSwap } from "../src/methods/swap-algs.js";
import { buildSwapDataset, verifySwapDataset, type SpecialAlgs } from "../src/data/swap-dataset.js";
import { cubeSymmetries } from "../src/core/symmetry.js";
import { opSystem } from "../src/methods/op.js";
import { ENGINE_VERSION } from "../src/version.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "content", "algs");

/** The 3-style datasets for the Gate B buffers (D-022). */
const DATASETS = [
  { id: "3style-corners.UFR", pieceType: "corners", buffer: "UFR", kind: "cycles" },
  { id: "3style-edges.UF", pieceType: "edges", buffer: "UF", kind: "cycles" },
  { id: "3style-twists.UFR", pieceType: "corners", buffer: "UFR", kind: "twists" },
  { id: "3style-flips.UF", pieceType: "edges", buffer: "UF", kind: "flips" },
] as const;

type Spec = (typeof DATASETS)[number];

function envelope(spec: Spec, bounds: CommSearchBounds, records: AlgDataset["records"]): AlgDataset {
  return {
    format: "bld-platform/alg-dataset",
    version: 1,
    id: spec.id,
    puzzle: "3x3x3",
    method: "3style",
    pieceType: spec.pieceType,
    buffer: spec.buffer,
    kind: spec.kind,
    generatedBy: { engine: ENGINE_VERSION, bounds: { generators: [...bounds.generators], maxInsertion: bounds.maxInsertion, maxSetup: bounds.maxSetup } },
    records,
  };
}

function cycles(puzzle: Puzzle, spec: Spec): AlgDataset {
  const bounds = DEFAULT_COMM_BOUNDS[spec.pieceType];
  const result = searchComms(puzzle, buildCatalogue(puzzle, spec.pieceType, bounds), { buffer: spec.buffer });
  if (!result.ok) throw new Error(`${spec.id}: ${JSON.stringify(result.error)}`);
  if (result.value.noComm.length > 0) throw new Error(`${spec.id}: no comm for ${JSON.stringify(result.value.noComm)}`);
  return envelope(
    spec,
    bounds,
    result.value.cases.map((c) => buildRecord(puzzle, spec.buffer, { kind: "cycle", targets: [c.targets[0], c.targets[1]] }, c.comms.map((f) => algEntry(puzzle, f, "engine-search")))),
  );
}

/** cubing.js's solution for the case state, as a dataset entry. */
async function solverEntry(puzzle: Puzzle, buffer: string, target: string, direction: "clockwise" | "counterclockwise" | undefined): Promise<AlgEntry> {
  const state = orientationPairPattern(puzzle, { buffer, target, ...(direction === undefined ? {} : { direction }) });
  if (!state.ok) throw new Error(JSON.stringify(state.error));
  const solution = new Alg(await experimentalSolve3x3x3IgnoringCenters(state.value)).toString();
  const parsed = parseAlg(puzzle.id, solution);
  if (!parsed.ok) throw new Error(`solver output "${solution}" doesn't parse: ${JSON.stringify(parsed.error)}`);
  const moves = cancelMoves(puzzle.id, expandNodes(parsed.value.nodes));
  // Store the cancelled sequence as the notation too: a plain move sequence has no structure to keep.
  const reparsed = parseAlg(puzzle.id, formatMoves(moves));
  if (!reparsed.ok) throw new Error("cancelled solver output doesn't parse");
  const { etm, qtm, htm, stm } = moveCounts(puzzle.id, moves);
  return { alg: formatAlg(reparsed.value), moves: formatMoves(moves), etm, qtm, htm, stm, source: "cubing-solver" };
}

async function orientation(puzzle: Puzzle, spec: Spec): Promise<{ dataset: AlgDataset; solverAlternates: number }> {
  const bounds = DEFAULT_ORIENTATION_BOUNDS[spec.pieceType];
  const result = searchOrientationAlgs(puzzle, buildOrientationCatalogue(puzzle, spec.pieceType, bounds), { buffer: spec.buffer });
  if (!result.ok) throw new Error(`${spec.id}: ${JSON.stringify(result.error)}`);
  if (result.value.noAlg.length > 0) throw new Error(`${spec.id}: no alg for ${JSON.stringify(result.value.noAlg)}`);
  let solverAlternates = 0;
  const records: AlgDataset["records"] = [];
  for (const c of result.value.cases) {
    const entries = c.comms.map((f) => algEntry(puzzle, f, "engine-search"));
    // D-023: the main alg stays comm-shaped; a shorter solver alg takes the last alternate slot.
    const solver = await solverEntry(puzzle, spec.buffer, c.target, c.direction);
    const best = entries[0];
    if (best !== undefined && solver.etm < best.etm && !entries.some((e) => e.moves === solver.moves)) {
      if (entries.length === 4) entries.pop();
      entries.push(solver);
      solverAlternates++;
    }
    const recordCase = spec.kind === "twists" ? { kind: "twist" as const, target: c.target, direction: c.direction ?? "clockwise" } : { kind: "flip" as const, target: c.target };
    records.push(buildRecord(puzzle, spec.buffer, recordCase, entries));
  }
  return { dataset: envelope(spec, bounds, records), solverAlternates };
}

/** The OP/OP datasets for the Gate B buffers (D-022, D-024), built and verified by `opSystem`. */
function opDatasets(puzzle: Puzzle): (OpSetupsDataset | OpParityDataset)[] {
  const system = opSystem(puzzle, { cornerBuffer: "UBL", edgeBuffer: "UR" });
  if (!system.ok) throw new Error(`OP datasets failed: ${JSON.stringify(system.error).slice(0, 1000)}`);
  return [system.value.corners, system.value.edges, system.value.parity];
}

/** The M2/OP datasets for the Gate B buffers (D-022, D-025), built and verified by `m2OpSystem`. Its corners must be the OP/OP ones. */
function m2Datasets(puzzle: Puzzle, opCorners: OpSetupsDataset | OpParityDataset | undefined): (SwapDataset | M2OpParityDataset)[] {
  const system = m2OpSystem(puzzle, { cornerBuffer: "UBL", edgeBuffer: "DF" });
  if (!system.ok) throw new Error(`M2 datasets failed: ${JSON.stringify(system.error).slice(0, 1000)}`);
  if (JSON.stringify(system.value.corners) !== JSON.stringify(opCorners)) throw new Error("M2/OP corners differ from the OP/OP corners dataset");
  return [system.value.edges, system.value.parity];
}

/** The 3-style and M2 + 3-style corners parity datasets (D-026), built from the datasets generated in this run and verified. */
function parityDatasets(puzzle: Puzzle, threeStyle: ReadonlyMap<string, AlgDataset>, m2Edges: SwapDataset | M2OpParityDataset | undefined): (ThreeStyleParityDataset | M2ThreeStyleParityDataset)[] {
  const get = (id: string) => {
    const dataset = threeStyle.get(id);
    if (dataset === undefined) throw new Error(`${id} wasn't generated`);
    return dataset;
  };
  if (m2Edges?.kind !== "setups") throw new Error("M2 edges weren't generated");
  const datasets = { corners: get("3style-corners.UFR"), edges: get("3style-edges.UF"), twists: get("3style-twists.UFR"), flips: get("3style-flips.UF") };
  const parity = buildThreeStyleParityDataset(puzzle, { id: "3style-parity.UFR-UF", ...datasets });
  if (!parity.ok) throw new Error(JSON.stringify(parity.error));
  const m2Parity = buildM2ThreeStyleParityDataset(puzzle, { id: "m2-3style-parity.UFR-DF", corners: datasets.corners, twists: datasets.twists, edges: m2Edges });
  if (!m2Parity.ok) throw new Error(JSON.stringify(m2Parity.error));
  const problems = [
    ...verifyThreeStyleParityDataset(puzzle, parity.value, datasets),
    ...verifyM2ThreeStyleParityDataset(puzzle, m2Parity.value, { corners: datasets.corners, twists: datasets.twists, edges: m2Edges }),
  ];
  if (problems.length > 0) throw new Error(`3-style parity failed verification: ${JSON.stringify(problems.slice(0, 5))}`);
  return [parity.value, m2Parity.value];
}

/**
 * The 4BLD swap methods (D-038): r2 for wings from DFr, U2 for x-centres from Ubr.
 *
 * Both buffers and both swaps are the ones the sources name; what they do is computed here. The special
 * cases — the targets on the pieces each swap carries — are searched for r2, and taken from the source
 * for U2, whose cases need a 3-cycle of x-centres on one face that no comm in the catalogue makes. Every
 * alg is verified against the effect the engine derives from the case, source or not.
 */
const R2_SOURCE_SPECIALS = new Map([
  // Speedsolving wiki, R2 page (retrieved 2026-09-16), in its own notation: r = 2R, d = 2D.
  ["UFr", ["F 2D R U R' 2D' R U' R' F' 2R2"]],
  ["DBr", ["2R2 F R U R' 2D R U' R' 2D' F'"]],
]);
const R2_CITATION = "Speedsolving wiki, R2 page, r-slice special cases (retrieved 2026-09-16)";
const U2_SPECIALS = new Map([
  // 4x4 Blindfolded, U2 Centers Method Tutorial (retrieved 2026-09-16): {r'ur} U {r'u'r} U {r'ur} U2 {r'u'r} U2,
  // with r and u read as the inner slices. Both algs match the effect the engine derives for their case.
  ["Ubl", ["2R' 2U 2R U 2R' 2U' 2R U 2R' 2U 2R U2 2R' 2U' 2R U2"]],
  ["Ufr", ["2R' 2U 2R U' 2R' 2U' 2R U' 2R' 2U 2R U2 2R' 2U' 2R U2"]],
]);
const U2_CITATION = "Speedsolving forums, 4x4 Blindfolded, U2 Centers Method Tutorial (retrieved 2026-09-16)";

function fourByFour(puzzle: Puzzle): SwapDataset[] {
  const identity = cubeSymmetries(puzzle).findIndex((g) => g.sticker.every((to, from) => to === from));
  const specs = [
    { id: "r2-wings.FDr", method: "r2" as const, bufferSticker: "FDr", pieceType: "wings" as const },
    { id: "u2-xcenters.Ubr", method: "u2" as const, bufferSticker: "Ubr", pieceType: "xcenters" as const },
  ];
  return specs.map(({ id, method, bufferSticker, pieceType: pieceTypeId }) => {
    const swap = referenceSwap(puzzle, method);
    if (!swap.ok) throw new Error(`${id}: ${JSON.stringify(swap.error)}`);
    const specials: SpecialAlgs =
      method === "u2"
        ? { kind: "given", algs: U2_SPECIALS, citation: U2_CITATION }
        : { kind: "search", catalogue: buildCatalogue(puzzle, pieceTypeId, SPECIAL_BOUNDS[method]) };
    const built = buildSwapDataset(puzzle, { id, swap: swap.value, bufferSticker, symmetry: identity, specials });
    if (!built.ok) throw new Error(`${id}: ${JSON.stringify(built.error)}`);
    const dataset = method === "r2" ? withSourceAlternates(puzzle, built.value) : built.value;
    const problems = verifySwapDataset(puzzle, dataset);
    if (problems.length > 0) throw new Error(`${id} failed verification: ${JSON.stringify(problems.slice(0, 5))}`);
    return dataset;
  });
}

/** The wiki's own r2 special algs, kept beside the searched ones (and verified with them). */
function withSourceAlternates(puzzle: Puzzle, dataset: SwapDataset): SwapDataset {
  return {
    ...dataset,
    records: dataset.records.map((record) => {
      const given = R2_SOURCE_SPECIALS.get(record.target);
      if (record.kind !== "special" || given === undefined) return record;
      const extra = given
        .map((alg) => algEntryFor(puzzle, alg, R2_CITATION))
        .filter((entry) => !record.algs.some((existing) => existing.moves === entry.moves));
      // A record holds at most four algs, and the source's own belongs among them.
      return { ...record, algs: [...record.algs.slice(0, 4 - extra.length), ...extra] };
    }),
  };
}

const algEntryFor = (puzzle: Puzzle, alg: string, citation: string): AlgEntry => entryForAlg(puzzle, alg, "reference", citation);

/** Every dataset as the exact file text to commit, verified. */
export async function generateDatasets(): Promise<Map<string, string>> {
  const puzzle = await loadPuzzle("3x3x3");
  const files = new Map<string, string>();
  const write = (folder: string, id: string, dataset: unknown) => {
    files.set(`${folder}/${id}.json`, `${JSON.stringify(dataset, null, 2)}\n`);
  };
  const op = opDatasets(puzzle);
  const m2 = m2Datasets(puzzle, op[0]);
  for (const dataset of [...op, ...m2]) {
    const parsed = ContentDatasetSchema.parse(JSON.parse(JSON.stringify(dataset)));
    write("3x3", parsed.id, dataset);
    console.error(`${dataset.id}: ${dataset.records.length} records verified`);
  }
  const threeStyle = new Map<string, AlgDataset>();
  for (const spec of DATASETS) {
    const started = performance.now();
    let dataset: AlgDataset;
    let note = "";
    if (spec.kind === "cycles") {
      dataset = cycles(puzzle, spec);
    } else {
      const generated = await orientation(puzzle, spec);
      dataset = generated.dataset;
      note = `, ${generated.solverAlternates} solver alternates`;
    }
    const problems = verifyDataset(puzzle, AlgDatasetSchema.parse(dataset));
    if (problems.length > 0) throw new Error(`${spec.id} failed verification: ${JSON.stringify(problems.slice(0, 5))}`);
    write("3x3", spec.id, dataset);
    threeStyle.set(spec.id, dataset);
    console.error(`${spec.id}: ${dataset.records.length} records verified${note} (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  }
  for (const dataset of parityDatasets(puzzle, threeStyle, m2[0])) {
    ContentDatasetSchema.parse(JSON.parse(JSON.stringify(dataset)));
    write("3x3", dataset.id, dataset);
    console.error(`${dataset.id}: verified`);
  }

  const four = await loadPuzzle("4x4x4");
  for (const dataset of fourByFour(four)) {
    ContentDatasetSchema.parse(JSON.parse(JSON.stringify(dataset)));
    write("4x4", dataset.id, dataset);
    console.error(`${dataset.id}: ${dataset.records.length} records verified`);
  }
  return files;
}

const normalise = (text: string) => text.replace(/\r\n/g, "\n");

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const files = await generateDatasets();
  if (check) {
    const stale = [...files].filter(([name, text]) => {
      const path = join(OUT_DIR, name);
      return !existsSync(path) || normalise(readFileSync(path, "utf8")) !== text;
    });
    if (stale.length > 0) {
      console.error(`stale or missing: ${stale.map(([name]) => name).join(", ")}; run pnpm engine:generate`);
      process.exitCode = 1;
    } else {
      console.error("all datasets match a fresh generation");
    }
  } else {
    for (const [name, text] of files) {
      const path = join(OUT_DIR, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
    console.error(`wrote ${files.size} datasets to content/algs/`);
  }
  // cubing.js's solver keeps a worker alive; nothing else is pending.
  process.exit();
}

if (process.argv[1]?.endsWith("generate-datasets.ts") === true) await main();
