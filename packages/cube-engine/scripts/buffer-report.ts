/**
 * Writes docs/reports/buffer-comparison.md: what the milestone 7 engines verify for every buffer, as
 * the input to Gate B. It chooses nothing: no defaults, no datasets.
 *
 *   pnpm engine:report buffers
 *
 * Everything but the timing columns is deterministic.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform } from "node:os";
import { join } from "node:path";
import { buildCatalogue, DEFAULT_COMM_BOUNDS } from "../src/commutator/catalogue.js";
import { formatMoves } from "../src/commutator/expand.js";
import { formatAlg } from "../src/commutator/parse.js";
import { searchComms } from "../src/commutator/search.js";
import { validateComm } from "../src/commutator/validate.js";
import { loadPuzzle, type Puzzle } from "../src/core/puzzle.js";
import { speffzScheme } from "../src/lettering/speffz.js";
import { DEFAULT_SETUP_POOLS, searchSetups, type SetupTable } from "../src/methods/setup-search.js";
import { m2Swaps, swapVariants, type SwapAlg } from "../src/methods/swap-algs.js";
import { pieceType } from "../src/pieces/piece-types.js";
import { combinedTable, reachabilityFor } from "./letter-pair-report.js";

type TypeId = "corners" | "edges";

function referenceSticker(puzzle: Puzzle, typeId: TypeId, piece: string): string {
  const sticker = pieceType(puzzle, typeId).pieceByName(piece)?.stickers.find((s) => s.isOrientationReference);
  if (sticker === undefined) throw new Error(`no reference sticker on ${piece}`);
  return sticker.name;
}

function distribution(values: readonly number[]): string {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => a - b).map((k) => `${k}: ${counts.get(k) ?? 0}`).join(" · ");
}

function mean(values: readonly number[]): string {
  return values.length === 0 ? "–" : (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
}

function threeStyleSection(puzzle: Puzzle): string {
  const parts: string[] = [];
  for (const typeId of ["corners", "edges"] as const) {
    const bounds = DEFAULT_COMM_BOUNDS[typeId];
    const started = performance.now();
    const catalogue = buildCatalogue(puzzle, typeId, bounds);
    const catalogueSeconds = (performance.now() - started) / 1000;
    const rows = ["| Buffer (sticker) | Cases with a comm | Best-comm ETM: moves: cases | Mean | Cases with no comm | Search time* |", "|---|---|---|---|---|---|"];
    for (const piece of pieceType(puzzle, typeId).pieces) {
      const buffer = referenceSticker(puzzle, typeId, piece.name);
      const t0 = performance.now();
      const result = searchComms(puzzle, catalogue, { buffer });
      const seconds = (performance.now() - t0) / 1000;
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      // Every comm the search returned (best and alternates) must solve its case, or no report is written.
      for (const found of result.value.cases) {
        for (const comm of found.comms) {
          const check = validateComm(puzzle, comm.alg, [buffer, found.targets[0], found.targets[1]]);
          if (!check.ok || !check.value.valid) throw new Error(`${buffer} ${found.targets.join(" ")}: ${formatAlg(comm.alg)} does not solve its case`);
        }
      }
      const best = result.value.cases.flatMap((c) => (c.comms[0] === undefined ? [] : [c.comms[0].counts.etm]));
      const noComm = result.value.noComm.map((t) => t.join("–")).join(", ");
      rows.push(`| ${piece.name} (${buffer}) | ${best.length} / ${result.value.cases.length} | ${distribution(best)} | ${mean(best)} | ${noComm === "" ? "none" : noComm} | ${seconds.toFixed(1)} s |`);
    }
    parts.push(
      [
        `### 3-style ${typeId}`,
        "",
        `Generators ${bounds.generators.join(" ")}; insertion ≤ ${bounds.maxInsertion}, setup ≤ ${bounds.maxSetup} (D-019). Catalogue: ${catalogue.size.toLocaleString("en")} comms, built in ${catalogueSeconds.toFixed(1)} s*.`,
        "",
        ...rows,
      ].join("\n"),
    );
  }
  return parts.join("\n\n");
}

interface VariantRow {
  readonly swap: SwapAlg;
  readonly table: SetupTable;
  readonly lengths: readonly number[];
}

function opSection(puzzle: Puzzle, method: "op-corners" | "op-edges"): string {
  const typeId: TypeId = method === "op-corners" ? "corners" : "edges";
  const variants = swapVariants(puzzle, method);
  if (!variants.ok) throw new Error(JSON.stringify(variants.error));
  const { pool, regime } = DEFAULT_SETUP_POOLS[method];

  const rowsByPiece = new Map<string, VariantRow[]>();
  for (const swap of variants.value) {
    const table = searchSetups(puzzle, { swap, bufferSticker: referenceSticker(puzzle, typeId, swap.bufferPiece), pool, regime });
    if (!table.ok) throw new Error(JSON.stringify(table.error));
    const lengths = table.value.targets.flatMap((t) => (t.setup === undefined ? [] : [t.setup.length]));
    rowsByPiece.set(swap.bufferPiece, [...(rowsByPiece.get(swap.bufferPiece) ?? []), { swap, table: table.value, lengths }]);
  }

  const summary = [
    "| Buffer (sticker) | Verified variants | Best variant: swap alg | Swap sticker | Side effect | Allowed setup moves | Setup length: moves: targets | Mean | Unreachable |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  const detail = ["| Buffer | Swap alg | ETM | Swap sticker | Side effect | Allowed | Forbidden (disturbs) | Setup lengths | Mean | Unreachable |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (const piece of pieceType(puzzle, typeId).pieces) {
    const rows = rowsByPiece.get(piece.name) ?? [];
    const score = (r: VariantRow) => [r.table.unreachable.length, r.lengths.reduce((a, b) => a + b, 0) / Math.max(1, r.lengths.length), r.swap.etm];
    const best = [...rows].sort((a, b) => {
      const [x, y] = [score(a), score(b)];
      return (x[0] ?? 0) - (y[0] ?? 0) || (x[1] ?? 0) - (y[1] ?? 0) || (x[2] ?? 0) - (y[2] ?? 0);
    })[0];
    if (best === undefined) throw new Error(`no ${method} variant for ${piece.name}`);
    summary.push(
      `| ${piece.name} (${best.table.bufferSticker}) | ${rows.length} | \`${formatMoves(best.swap.moves)}\` | ${best.table.swapSticker} | ${best.swap.sideEffectPieces.join(" ↔ ")} | ${best.table.allowed.join(" ")} | ${distribution(best.lengths)} | ${mean(best.lengths)} | ${best.table.unreachable.join(" ") || "none"} |`,
    );
    for (const row of rows) {
      const forbidden = row.table.forbidden.map((f) => `${f.family} (${f.disturbs.join(", ")})`).join("; ");
      detail.push(
        `| ${piece.name} | \`${formatMoves(row.swap.moves)}\` | ${row.swap.etm} | ${row.table.swapSticker} | ${row.swap.sideEffectPieces.join(" ↔ ")} | ${row.table.allowed.join(" ")} | ${forbidden || "none"} | ${distribution(row.lengths)} | ${mean(row.lengths)} | ${row.table.unreachable.join(" ") || "none"} |`,
      );
    }
  }
  const title = method === "op-corners" ? "OP corners" : "OP edges";
  return [
    `### ${title}`,
    "",
    `Setup pool ${pool.join(" ")}, regime \`${regime}\` (D-021). "Best variant" means the fewest unreachable targets, then the shortest mean setup, then the shortest swap alg. It's a summary, not a recommendation.`,
    "",
    ...summary,
    "",
    `<details><summary>All ${variants.value.length} verified ${title} variants</summary>`,
    "",
    ...detail,
    "",
    "</details>",
  ].join("\n");
}

function m2Section(puzzle: Puzzle): string {
  const swaps = m2Swaps(puzzle);
  if (!swaps.ok) throw new Error(JSON.stringify(swaps.error));
  const { pool, regime } = DEFAULT_SETUP_POOLS.m2;
  const rows = ["| Buffer (sticker) | Helper | Side effect | Setup length: moves: targets | Mean | Targets that can't be set up (M-slice special cases) |", "|---|---|---|---|---|---|"];
  for (const swap of [...swaps.value].sort((a, b) => a.bufferPiece.localeCompare(b.bufferPiece))) {
    const table = searchSetups(puzzle, { swap, bufferSticker: referenceSticker(puzzle, "edges", swap.bufferPiece), pool, regime });
    if (!table.ok) throw new Error(JSON.stringify(table.error));
    const lengths = table.value.targets.flatMap((t) => (t.setup === undefined ? [] : [t.setup.length]));
    rows.push(
      `| ${swap.bufferPiece} (${table.value.bufferSticker}) | ${swap.swapPiece} (${table.value.swapSticker}) | ${swap.sideEffectPieces.join(", ")} | ${distribution(lengths)} | ${mean(lengths)} | ${table.value.unreachable.join(" ")} |`,
    );
  }
  return [
    `Swap \`M2\`; setup pool ${pool.join(" ")}, regime \`${regime}\` (D-021). BRIEF §5.4 names DF; the other M-slice buffers are shown for comparison. The special cases and the odd/even rule are milestone 10.`,
    "",
    ...rows,
  ].join("\n");
}

function orientationSection(puzzle: Puzzle, corners: ReturnType<typeof reachabilityFor>, edges: ReturnType<typeof reachabilityFor>): string {
  const scheme = speffzScheme(puzzle);
  const lines = [
    "| Piece type | `separate`: twist or flip algs needed (buffer with each other piece) | `asTargets`: same-piece target pairs a trace can produce |",
    "|---|---|---|",
  ];
  for (const [typeId, rows] of [["corners", corners], ["edges", edges]] as const) {
    const type = pieceType(puzzle, typeId);
    const letters = scheme.letters[typeId] ?? {};
    const pieceOfLetter = new Map(type.stickers.map((s) => [letters[s.name] ?? "", s.position]));
    const withTwists = (type.pieces.length - 1) * (type.orientationOrder - 1);
    const counts = rows
      .filter((r) => r.policy === "asTargets")
      .map((r) => [...r.reachable].filter((pair) => pieceOfLetter.get(pair[0] ?? "") === pieceOfLetter.get(pair[1] ?? "")).length);
    const samePiece = Math.min(...counts) === Math.max(...counts) ? String(counts[0] ?? 0) : `${Math.min(...counts)}–${Math.max(...counts)}`;
    lines.push(`| ${typeId} | ${withTwists} | ${samePiece} (same for every buffer) |`);
  }
  return [
    "## Orientation policy per method",
    "",
    "What each `orientedInPlace` policy (D-012) needs beyond what milestone 7 built. None of these algs are generated yet; that is milestone 8.",
    "",
    ...lines,
    "",
    "- **3-style.** The comm search covers pairs on two different pieces. `separate` then needs a twist or flip alg for each non-buffer piece. `asTargets` instead needs an alg for each same-piece pair that tracing can produce.",
    "- **OP and M2** shoot one target at a time. Under `asTargets`, the setup tables above already cover every sticker (the M2 special cases aside). Under `separate`, they need the same twist and flip algs as 3-style.",
  ].join("\n");
}

export async function bufferReport(): Promise<void> {
  const puzzle = await loadPuzzle("3x3x3");
  const started = performance.now();
  const threeStyle = threeStyleSection(puzzle);
  const opCorners = opSection(puzzle, "op-corners");
  const opEdges = opSection(puzzle, "op-edges");
  const m2 = m2Section(puzzle);
  const corners = reachabilityFor(puzzle, "corners");
  const edges = reachabilityFor(puzzle, "edges");

  const md = `# Buffer comparison

Generated by \`pnpm engine:report buffers\` as the input to Gate B. **It chooses nothing: no buffer, variant or policy is a default, and no dataset exists yet.** Buffers are named by piece, with the orientation-reference sticker used as the buffer sticker (D-009, D-012).

**What was checked.**
- **3-style.** Every comm counted here (the best and three alternates for every case of every buffer) passed \`validateComm\` while this file was generated.
- **Swap algs.** Every swap alg's effect was recomputed from its moves and shape-checked (D-020).
- **Setups.** Every setup table here, with the same pools and buffer stickers, is checked target by target in the geometry model by \`test/methods/setup-search.test.ts\` (D-021).

\\* Times are single-threaded on ${cpus()[0]?.model.trim() ?? "unknown CPU"}, ${platform()}, Node ${process.version}, in one warm process. They vary by machine, and everything else in this file is deterministic. The budget figures of record are in D-019.

## 3-style

${threeStyle}

## Old Pochmann

Swap algs are J Perm's two reference swaps and their verified symmetry images (D-020). Setups are the shortest that keep the buffer and the swap's side effect in place (D-021).

${opCorners}

${opEdges}

## M2

${m2}

${orientationSection(puzzle, corners, edges)}

## Letter pairs each buffer combination can produce

Distinct-letter pairs that tracing can produce with corners and edges together, out of 552 (D-013 consequence 4; the same computation as \`docs/reports/letter-pair-reachability.md\`). A corner buffer and an edge buffer that share a Speffz letter lose every pair containing it.

### separate

${combinedTable(corners, edges, "separate", "Corner", "Edge")}

### asTargets

${combinedTable(corners, edges, "asTargets", "Corner", "Edge")}
`;

  const reportsDir = join(import.meta.dirname, "..", "..", "..", "docs", "reports");
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "buffer-comparison.md"), md);
  console.log(`wrote docs/reports/buffer-comparison.md in ${((performance.now() - started) / 1000).toFixed(1)} s`);
}
