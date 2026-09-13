/**
 * Writes docs/fixtures/SPOT-CHECK.md: real scrambles with colour nets and traced memo, for checking
 * on a physical cube.
 *
 *   pnpm --filter @bld/cube-engine exec tsx scripts/spot-check-sheet.ts --corners UFR --edges UF [--count 10] [--seed real-scramble-fixtures]
 *
 * Uses the same seeded scrambles as the R01–R10 golden fixtures, so the sheet and the fixtures agree.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Alg } from "cubing/alg";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import { loadPuzzle } from "../src/core/puzzle.js";
import { speffzScheme } from "../src/lettering/speffz.js";
import { createRng } from "../src/random/prng.js";
import { randomState3x3 } from "../src/random/random-state.js";
import { trace, type TraceResult } from "../src/trace/trace.js";
import { TraceOracle } from "../test/oracle/trace-oracle.js";
import { renderNet } from "./nets.js";

const { values } = parseArgs({
  options: {
    corners: { type: "string" },
    edges: { type: "string" },
    count: { type: "string", default: "10" },
    seed: { type: "string", default: "real-scramble-fixtures" },
  },
});
if (values.corners === undefined || values.edges === undefined) {
  throw new Error("Pass --corners <buffer sticker> and --edges <buffer sticker>; buffers are your choice, not a default.");
}

const puzzle = await loadPuzzle("3x3x3");
const scheme = speffzScheme(puzzle);
const oracle = new TraceOracle(3, "corners");
const rng = createRng(values.seed);

function describe(result: TraceResult, kind: "corners" | "edges"): string {
  const pairs = result.pairs.map((p) => p.join("")).join(" ");
  const breaks = result.cycleBreaks.length === 0 ? "none" : result.cycleBreaks.map((i) => `${result.targets[i] ?? "?"} (target ${i + 1})`).join(", ");
  const misoriented = result.orientedInPlace
    .map((o) => `${o.piece}${o.isBuffer ? " (buffer)" : ""} → ${o.letter}${o.direction === "flip" ? "" : `, ${o.direction}`}`)
    .join("; ");
  return [
    `- **${kind}** (buffer ${result.buffer.sticker}): ${pairs === "" ? "no targets" : pairs}`,
    `  - cycle breaks: ${breaks}`,
    `  - ${kind === "corners" ? "twisted" : "flipped"} in place: ${misoriented === "" ? "none" : misoriented}`,
    `  - parity: ${result.parity ? "yes" : "no"} (${result.targetCount} targets)`,
  ].join("\n");
}

const sections: string[] = [];
for (let i = 1; i <= Number(values.count); i++) {
  const state = randomState3x3(puzzle, rng);
  const scramble = new Alg(await experimentalSolve3x3x3IgnoringCenters(state)).invert().toString();
  const results = (["corners", "edges"] as const).map((kind) => {
    const r = trace(puzzle, { alg: scramble }, { pieceType: kind, buffer: kind === "corners" ? values.corners ?? "" : values.edges ?? "", scheme });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return describe(r.value, kind);
  });
  sections.push(
    [`## ${String(i).padStart(2, "0")}`, "", "```", scramble, "```", "", "```", renderNet(oracle, oracle.coloursAfter(scramble)), "```", "", ...results].join(
      "\n",
    ),
  );
}

const header = `# Spot-check sheet

Scrambles from seed \`${values.seed}\`, traced with Speffz, corner buffer **${values.corners}**, edge buffer **${values.edges}**,
default policy (break into the lowest letter; twisted and flipped pieces reported separately).

Hold the cube in the WCA scrambling orientation (white on top, green in front), apply the scramble,
and check the memo. Nets show each sticker as the face it belongs to: U white, F green, R red, D yellow, L orange, B blue.
`;

const outDir = join(import.meta.dirname, "..", "..", "..", "docs", "fixtures");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "SPOT-CHECK.md"), `${header}\n${sections.join("\n\n")}\n`);
console.log(`wrote ${join(outDir, "SPOT-CHECK.md")}`);
