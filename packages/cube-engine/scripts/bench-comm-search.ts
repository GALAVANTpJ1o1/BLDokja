/**
 * The comm search's time budget (DECISIONS D-019): one piece type's full case set for one buffer,
 * in a fresh Node process, single-threaded, must take at most 60 s including the catalogue build and
 * a validateComm check of every returned comm.
 *
 *   pnpm engine:bench comms
 *
 * 1. Warm pass, one process: build each piece type's catalogue once, then time every buffer piece
 *    (its orientation-reference sticker as the buffer).
 * 2. Cold pass: the slowest buffer of each piece type again, in three fresh child processes, each
 *    doing catalogue + search + verification from nothing. The budget figure is the maximum.
 *
 * Output is printed; the figures of record are copied into D-019 with the machine they came from.
 */
import { spawnSync } from "node:child_process";
import { cpus, platform, totalmem } from "node:os";
import { buildCatalogue, DEFAULT_COMM_BOUNDS, type CommCatalogue } from "../src/commutator/catalogue.js";
import { searchComms } from "../src/commutator/search.js";
import { validateComm } from "../src/commutator/validate.js";
import { loadPuzzle, type Puzzle } from "../src/core/puzzle.js";
import { pieceType } from "../src/pieces/piece-types.js";

type TypeId = "corners" | "edges";
const TYPES: TypeId[] = ["corners", "edges"];
const BUDGET_MS = 60_000;
const COLD_RUNS = 3;

interface Timing {
  readonly buffer: string;
  readonly searchMs: number;
  readonly verifyMs: number;
  readonly comms: number;
  readonly noComm: number;
  readonly exactEvaluations: number;
}

interface ColdTiming extends Timing {
  readonly loadMs: number;
  readonly catalogueMs: number;
  /** Catalogue + search + verification: the budgeted work. */
  readonly budgetedMs: number;
}

function referenceBuffers(puzzle: Puzzle, typeId: TypeId): string[] {
  return pieceType(puzzle, typeId).pieces.map((piece) => {
    const reference = piece.stickers.find((s) => s.isOrientationReference);
    if (reference === undefined) throw new Error(`${piece.name} has no reference sticker`);
    return reference.name;
  });
}

function timeBuffer(puzzle: Puzzle, catalogue: CommCatalogue, buffer: string): Timing {
  const started = performance.now();
  const result = searchComms(puzzle, catalogue, { buffer });
  const searched = performance.now();
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  let comms = 0;
  for (const found of result.value.cases) {
    for (const comm of found.comms) {
      const check = validateComm(puzzle, comm.alg, [buffer, found.targets[0], found.targets[1]]);
      if (!check.ok || !check.value.valid) throw new Error(`${buffer} ${found.targets.join(" ")}: a returned comm does not solve its case`);
      comms++;
    }
  }
  return {
    buffer,
    searchMs: searched - started,
    verifyMs: performance.now() - searched,
    comms,
    noComm: result.value.noComm.length,
    exactEvaluations: result.value.stats.exactEvaluations,
  };
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/** Child mode: everything from nothing, for one buffer. */
async function single(typeId: TypeId, buffer: string): Promise<void> {
  const started = performance.now();
  const puzzle = await loadPuzzle("3x3x3");
  const loaded = performance.now();
  const catalogue = buildCatalogue(puzzle, typeId, DEFAULT_COMM_BOUNDS[typeId]);
  const catalogueMs = performance.now() - loaded;
  const timing = timeBuffer(puzzle, catalogue, buffer);
  const cold: ColdTiming = { ...timing, loadMs: loaded - started, catalogueMs, budgetedMs: catalogueMs + timing.searchMs + timing.verifyMs };
  console.log(JSON.stringify(cold));
}

export async function benchCommSearch(args: readonly string[]): Promise<void> {
  if (args[0] === "--single") {
    const [, typeId, buffer] = args;
    if ((typeId !== "corners" && typeId !== "edges") || buffer === undefined) throw new Error("usage: comms --single <corners|edges> <buffer>");
    await single(typeId, buffer);
    return;
  }

  const cpu = cpus()[0]?.model ?? "unknown CPU";
  console.log(`# Comm search benchmark (${new Date().toISOString().slice(0, 10)})`);
  console.log(`machine: ${cpu}, ${cpus().length} logical cores, ${Math.round(totalmem() / 2 ** 30)} GiB, ${platform()}, Node ${process.version}`);
  console.log(`bounds: corners ${JSON.stringify(DEFAULT_COMM_BOUNDS.corners)}; edges ${JSON.stringify(DEFAULT_COMM_BOUNDS.edges)}`);

  const puzzle = await loadPuzzle("3x3x3");
  let overBudget = false;
  for (const typeId of TYPES) {
    const catalogueStarted = performance.now();
    const catalogue = buildCatalogue(puzzle, typeId, DEFAULT_COMM_BOUNDS[typeId]);
    const catalogueMs = performance.now() - catalogueStarted;
    console.log(`\n## ${typeId}: warm pass (catalogue ${seconds(catalogueMs)}, ${catalogue.size} comms)`);
    console.log("| buffer | search | verify | comms returned | no comm | exact evaluations |");
    console.log("|---|---|---|---|---|---|");
    const timings: Timing[] = [];
    for (const buffer of referenceBuffers(puzzle, typeId)) {
      const t = timeBuffer(puzzle, catalogue, buffer);
      timings.push(t);
      console.log(`| ${buffer} | ${seconds(t.searchMs)} | ${seconds(t.verifyMs)} | ${t.comms} | ${t.noComm} | ${t.exactEvaluations.toLocaleString("en")} |`);
    }
    const slowest = timings.reduce((a, b) => (b.searchMs + b.verifyMs > a.searchMs + a.verifyMs ? b : a));

    console.log(`\n## ${typeId}: cold pass, slowest buffer ${slowest.buffer}, ${COLD_RUNS} fresh processes`);
    console.log("| run | puzzle load | catalogue | search | verify | budgeted total |");
    console.log("|---|---|---|---|---|---|");
    const colds: ColdTiming[] = [];
    for (let run = 1; run <= COLD_RUNS; run++) {
      const child = spawnSync(process.execPath, ["--import", "tsx", process.argv[1] ?? "", "comms", "--single", typeId, slowest.buffer], { encoding: "utf8" });
      if (child.status !== 0) throw new Error(`cold run failed: ${child.stderr}`);
      const line = child.stdout.trim().split("\n").pop() ?? "";
      const cold = JSON.parse(line) as ColdTiming;
      colds.push(cold);
      console.log(`| ${run} | ${seconds(cold.loadMs)} | ${seconds(cold.catalogueMs)} | ${seconds(cold.searchMs)} | ${seconds(cold.verifyMs)} | ${seconds(cold.budgetedMs)} |`);
    }
    const figure = Math.max(...colds.map((c) => c.budgetedMs));
    const verdict = figure <= BUDGET_MS ? "within budget" : "OVER BUDGET";
    if (figure > BUDGET_MS) overBudget = true;
    console.log(`\n**${typeId} budget figure: ${seconds(figure)} (maximum of ${COLD_RUNS} cold runs), ${verdict} (${seconds(BUDGET_MS)}).**`);
  }
  if (overBudget) process.exitCode = 1;
}
