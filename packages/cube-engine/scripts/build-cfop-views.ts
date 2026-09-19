/**
 * Builds content/algs/cfop/curated/views.json: for every curated case, the moves that draw it and what a recognition
 * diagram needs (D-080). The web app renders reference grids from this file with no cube engine at all, so a page of
 * 57 cards is static HTML and paints at once; the 3D cube (which does load the engine) only opens on demand (§79).
 *
 *   top:   21 colour letters: the nine top stickers (back to front, left to right), then the three top-layer stickers of the
 *          back, right, front and left faces in the order they appear around the diagram.
 *   iso:   F2L only. 27 colour letters for the U, F and R faces (row by row), and 27 visibility flags (h highlight, n normal, d dim).
 *   features: what to look for, read from the same state (which top edges and corners are lit; which sides carry a bar or headlights).
 *
 *   pnpm --filter @bld/cube-engine exec tsx scripts/build-cfop-views.ts [--check]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Alg } from "cubing/alg";
import type { KPattern } from "cubing/kpuzzle";
import { caseSetup, CuratedSetSchema } from "../src/cfop/curated.js";
import { F2LSetSchema, mirrorAlg } from "../src/cfop/f2l.js";
import { orientationFeatures, permutationFeatures, topView } from "../src/cfop/recognition.js";
import { renderPlan } from "../src/cfop/render-modes.js";
import { faceletsOf, loadPuzzle, type Puzzle } from "../src/index.js";

const DIR = join(import.meta.dirname, "..", "..", "..", "content", "algs", "cfop", "curated");
const puzzle = await loadPuzzle("3x3x3");
const solved = puzzle.kpuzzle.defaultPattern();

function topString(state: KPattern): string {
  const v = topView(puzzle, state);
  return [...v.top.flat(), ...v.back, ...v.right, ...v.front, ...v.left].join("");
}

function isoOf(state: KPattern): { colours: string; flags: string } {
  const facelets = faceletsOf(puzzle, state);
  const plan = renderPlan(puzzle, state, "F2L_SINGLE_PAIR");
  let colours = ""; let flags = "";
  for (const face of ["U", "F", "R"] as const) for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) {
    const sticker = puzzle.geometry.stickers.find((s) => s.face === face && s.row === row && s.col === col);
    if (sticker === undefined) throw new Error("missing sticker");
    colours += puzzle.geometry.stickers[facelets[sticker.index] ?? sticker.index]?.face ?? "?";
    const name = slotName(puzzle, sticker.index);
    const v = plan.visibility.get(name);
    flags += v === "highlight" ? "h" : v === "dim" ? "d" : "n";
  }
  return { colours, flags };
}

import { stickerName } from "../src/pieces/names.js";
function slotName(p: Puzzle, index: number): string { return stickerName(p.geometry, index); }

const views: Record<string, unknown> = {};
for (const name of ["eo", "co", "cp", "ep", "oll", "pll"] as const) {
  const set = CuratedSetSchema.parse(JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")));
  for (const kase of set.cases) {
    const setup = caseSetup(puzzle, set.stage, kase);
    const state = solved.applyAlg(setup);
    const view = topView(puzzle, state);
    const o = orientationFeatures(view); const p = permutationFeatures(view);
    views[kase.id] = { setup, top: topString(state), features: { edgeSides: o.edgeSides, cornerPlaces: o.cornerPlaces, bars: p.bars, headlights: p.headlights } };
  }
}
const f2l = F2LSetSchema.parse(JSON.parse(readFileSync(join(DIR, "f2l.json"), "utf8")));
for (const kase of f2l.cases) {
  const alg = kase.algs["2H"].alg;
  const setup = new Alg(alg).invert().toString();
  const mirrored = mirrorAlg(setup);
  views[kase.id] = { setup, iso: isoOf(solved.applyAlg(setup)), mirror: { setup: mirrored, alg: mirrorAlg(alg), iso: isoOf(solved.applyAlg(mirrored)) } };
}

const text = `${JSON.stringify({ format: "bld-platform/curated-views", version: 1, views }, null, 0).replaceAll('},"', '},\n"')}\n`;
const file = join(DIR, "views.json");
if (process.argv.includes("--check")) {
  if (!existsSync(file) || readFileSync(file, "utf8").replaceAll("\r\n", "\n") !== text) { console.error("views.json is out of date"); process.exit(1); }
} else writeFileSync(file, text);
console.log(`views: ${Object.keys(views).length} cases`);
