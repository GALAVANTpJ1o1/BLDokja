/**
 * Builds content/algs/cfop/curated/f2l.json (DECISIONS D-081). No F2L algorithm table was supplied, so each of the 41
 * enumerated cases gets a reference solution found by a written-down rule: the shortest sequence in {R, U}, then in
 * {R, U, F}, that solves the pair and keeps the cross, ranked by `ergonomicCost` among the shortest. Every solution is
 * re-verified against its case before the file is written, and the file says plainly that it is a search result.
 * Replace `source` and `alg` with a curated table when one is supplied; the schema and tests do not change.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadPuzzle } from "../src/core/puzzle.js";
import { ergonomicCost, f2lCases, f2lPattern, F2LSetSchema, searchF2LSolutions, verifyF2LSet, type F2LSet } from "../src/cfop/f2l.js";

const OUT = join(import.meta.dirname, "..", "..", "..", "content", "algs", "cfop", "curated", "f2l.json");
const SOURCE = "Engine search: shortest sequence in R and U (then R, U and F) that solves the pair and keeps the cross, ranked by a fixed ergonomic rule. Not a curated speedsolving table.";
const puzzle = await loadPuzzle("3x3x3");
const cases: F2LSet["cases"] = [];
for (const kase of f2lCases(puzzle)) {
  const start = f2lPattern(puzzle, kase.placement);
  let solutions = searchF2LSolutions(puzzle, start, ["R", "U"], 12, 4000);
  if (solutions.length === 0) solutions = searchF2LSolutions(puzzle, start, ["R", "U", "F"], 9, 4000);
  const best = solutions.slice().sort((a, b) => ergonomicCost(a) - ergonomicCost(b) || a.join(" ").localeCompare(b.join(" ")))[0];
  if (best === undefined) throw new Error(`no reference solution found for F2L case ${kase.index}`);
  const alg = best.join(" ");
  console.log(String(kase.index).padStart(2), kase.family.padEnd(22), JSON.stringify(kase.placement), alg);
  cases.push({
    id: `f2l_${String(kase.index).padStart(2, "0")}`, number: kase.index, name: `F2L ${kase.index}`, family: kase.family,
    aliases: [`f2l ${kase.index}`, String(kase.index)], placement: kase.placement,
    algs: { "2H": { alg, moves: best.length, source: SOURCE } }, missing: ["OH"],
  });
}
const set: F2LSet = { format: "bld-platform/curated-f2l", version: 1, provenance: SOURCE, cases };
F2LSetSchema.parse(set);
const problems = verifyF2LSet(puzzle, set);
if (problems.length > 0) { console.error(problems.join("\n")); process.exit(1); }
const text = `${JSON.stringify(set, null, 1)}\n`;
if (process.argv.includes("--check")) { if (!existsSync(OUT) || readFileSync(OUT, "utf8").replaceAll("\r\n", "\n") !== text) { console.error("f2l.json is out of date"); process.exit(1); } }
else { mkdirSync(join(OUT, ".."), { recursive: true }); writeFileSync(OUT, text); }
console.log("f2l: 41 cases");
