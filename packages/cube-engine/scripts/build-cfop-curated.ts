/**
 * Builds the curated CFOP last-layer datasets in content/algs/cfop/curated/ from the owner-supplied
 * tables in cfop-source.ts (DECISIONS D-080). The case state of every record is read off the *algorithm's own
 * starting state*, so an algorithm can only be stored with a case it really solves; the other execution
 * style's AUFs are searched on that state. Nothing is written unless every record verifies.
 *
 *   pnpm --filter @bld/cube-engine exec tsx scripts/build-cfop-curated.ts          write the files
 *   pnpm --filter @bld/cube-engine exec tsx scripts/build-cfop-curated.ts --check  exit 1 if any file differs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expandNodes } from "../src/commutator/expand.js";
import { moveCounts } from "../src/commutator/metrics.js";
import { parseAlg } from "../src/commutator/parse.js";
import { loadPuzzle, type Puzzle } from "../src/core/puzzle.js";
import {
  stageStartState, casePattern, endingRotationOf, findAufs, firstTwoLayersIntact, stateFromStart, verifyCuratedSet,
  type CuratedAlg, type CuratedCase, type CuratedSet, type CuratedStage,
} from "../src/cfop/curated.js";
import { CO_2LOOK, CP_2LOOK, EO_2LOOK, EP_2LOOK, OLL, PLL } from "./cfop-source.js";

const OUT = join(import.meta.dirname, "..", "..", "..", "content", "algs", "cfop", "curated");
const SOURCE = "Owner-supplied algorithm table (BLDokja polishing brief, 2026-09-19), transcribed and verified against the cube engine";

/** Sune, Anti-Sune and the other 2-look corner names, checked below against the full-OLL state they name. */
const OLL_NICKNAMES: Readonly<Record<number, { name: string; coKey: string }>> = {
  21: { name: "H", coKey: "h" }, 22: { name: "Pi", coKey: "pi" }, 23: { name: "U", coKey: "u" }, 24: { name: "T", coKey: "t" },
  25: { name: "L", coKey: "l" }, 26: { name: "Anti-Sune", coKey: "antisune" }, 27: { name: "Sune", coKey: "sune" },
};

function htm(puzzle: Puzzle, alg: string): number {
  const parsed = parseAlg(puzzle.id, alg);
  if (!parsed.ok) throw new Error(`cannot parse "${alg}"`);
  return moveCounts(puzzle.id, expandNodes(parsed.value.nodes)).htm;
}

function entry(puzzle: Puzzle, alg: string, aufs: { pre: string; post: string }): CuratedAlg {
  const rotation = endingRotationOf(puzzle, alg);
  if (rotation === undefined) throw new Error(`no ending rotation for ${alg}`);
  return { alg, preAuf: aufs.pre as CuratedAlg["preAuf"], postAuf: aufs.post as CuratedAlg["postAuf"], moves: htm(puzzle, alg), endingRotation: rotation, source: SOURCE };
}

interface Row { readonly id: string; readonly number?: number; readonly name: string; readonly group: string; readonly aliases: readonly string[]; readonly two: string | undefined; readonly oh: string | undefined }

function build(puzzle: Puzzle, stage: CuratedStage, rows: readonly Row[]): CuratedSet {
  const cases: CuratedCase[] = rows.map((row) => {
    const primary = row.two ?? row.oh;
    if (primary === undefined) throw new Error(`${row.id} has no algorithm`);
    const start = stageStartState(puzzle, stage, primary);
    if (start === undefined) throw new Error(`${row.id}: no centre frame`);
    if (!firstTwoLayersIntact(start)) throw new Error(`${row.id}: starting state breaks the first two layers`);
    const state = stateFromStart(stage, start);
    const pattern = casePattern(puzzle, stage, state);
    const algs: CuratedCase["algs"] = {};
    const missing: ("2H" | "OH")[] = [];
    for (const style of ["2H", "OH"] as const) {
      const alg = style === "2H" ? row.two : row.oh;
      if (alg === undefined) { missing.push(style); continue; }
      const aufs = findAufs(puzzle, pattern, alg, stage);
      if (aufs === undefined) throw new Error(`${row.id} ${style}: no AUF makes "${alg}" solve the stored state`);
      algs[style] = entry(puzzle, alg, aufs);
    }
    return { id: row.id, ...(row.number === undefined ? {} : { number: row.number }), name: row.name, group: row.group, aliases: [...row.aliases], state, algs, missing };
  });
  return { format: "bld-platform/curated-cases", version: 1, stage, provenance: SOURCE, cases };
}

const title = (s: string) => s;
const puzzle = await loadPuzzle("3x3x3");
const sets: Record<string, CuratedSet> = {};

sets.eo = build(puzzle, "eo", EO_2LOOK.map((r) => ({
  id: `eo_${r.key.replace("-shape", "")}`, name: r.name, group: "Edge orientation", two: r.alg, oh: undefined,
  aliases: r.key === "dot" ? ["dot", "dot shape"] : r.key === "line" ? ["line", "i", "i shape", "bar"] : ["l", "l shape"],
})));
sets.co = build(puzzle, "co", CO_2LOOK.map((r) => ({ id: `co_${r.key}`, name: r.name, group: "Corner orientation", two: r.alg, oh: undefined, aliases: [r.name, r.key] })));
sets.cp = build(puzzle, "cp", CP_2LOOK.map((r) => ({
  id: `cp_${r.key}`, name: r.name, group: "Corner permutation", two: r.alg, oh: undefined,
  aliases: r.key === "diagonal" ? ["diagonal", "diagonal swap", "diag", "y", "y perm", "no headlights"] : ["headlights", "headlight", "adjacent", "adjacent swap", "t", "t perm"],
})));
sets.ep = build(puzzle, "ep", EP_2LOOK.map((r) => ({ id: `ep_${r.key}`, name: r.name, group: "Edge permutation", two: r.alg, oh: undefined, aliases: [r.name, `${r.name} perm`] })));
sets.oll = build(puzzle, "oll", OLL.map(([n, group, two, oh]) => {
  const nick = OLL_NICKNAMES[n];
  return { id: `oll_${String(n).padStart(2, "0")}`, number: n, name: nick?.name ?? title(group), group, two, oh, aliases: [`oll ${n}`, String(n), ...(nick === undefined ? [] : [nick.name])] };
}));
sets.pll = build(puzzle, "pll", PLL.map(([name, group, two, oh]) => ({ id: `pll_${name.toLowerCase()}`, name, group, two, oh, aliases: [name, `${name} perm`] })));

// The named 2-look corner cases must be the same corner-orientation classes as the full OLL numbers they share a name with.
{
  const rotations = (v: readonly number[]) => [0, 1, 2, 3].map((k) => [...v.slice(k), ...v.slice(0, k)].join(""));
  const same = (a: readonly number[], b: readonly number[]) => rotations(a).includes(b.join(""));
  for (const [number, { coKey }] of Object.entries(OLL_NICKNAMES)) {
    const full = sets.oll.cases.find((c) => c.number === Number(number));
    const two = sets.co.cases.find((c) => c.id === `co_${coKey}`);
    if (full?.state.co === undefined || two?.state.co === undefined || full.state.eo?.some((v) => v !== 0)) throw new Error(`OLL ${number} nickname ${coKey}: not a corner-orientation-only case`);
    if (!same(full.state.co, two.state.co)) throw new Error(`OLL ${number} is not the ${coKey} corner case`);
  }
}

const problems: string[] = [];
for (const set of Object.values(sets)) for (const p of verifyCuratedSet(puzzle, set)) problems.push(`${set.stage}: ${p.case} ${p.style ?? ""} ${p.reason}`);
if (problems.length > 0) { console.error(problems.join("\n")); process.exit(1); }

const check = process.argv.includes("--check");
if (!check && !existsSync(OUT)) mkdirSync(OUT, { recursive: true });
let differs = false;
for (const [name, set] of Object.entries(sets)) {
  const text = `${JSON.stringify(set, null, 1)}\n`;
  const file = join(OUT, `${name}.json`);
  if (check) { if (!existsSync(file) || readFileSync(file, "utf8").replaceAll("\r\n", "\n") !== text) { console.error(`${name}.json is out of date`); differs = true; } }
  else writeFileSync(file, text);
  console.log(`${name}: ${set.cases.length} cases`);
}
process.exit(differs ? 1 : 0);
