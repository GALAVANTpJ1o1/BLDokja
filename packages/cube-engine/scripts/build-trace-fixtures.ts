/**
 * Turns each hand-written 3x3x3 trace fixture into a real scramble.
 *
 * The state comes from test/fixtures/construct.ts (never from the tracer). This script only finds
 * a move sequence reaching it: it solves the state with cubing.js's independent solver and inverts
 * the solution. The fixture test re-checks that the stored scramble reproduces the constructed
 * colours in the geometry model, so a stale or wrong scramble fails loudly.
 *
 *   pnpm --filter @bld/cube-engine exec tsx scripts/build-trace-fixtures.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Alg } from "cubing/alg";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import { mod, permutationParity } from "../src/core/arrays.js";
import { loadPuzzle } from "../src/core/puzzle.js";
import { coloursToPattern, constructColours } from "../test/fixtures/construct.js";
import { TRACE_FIXTURES } from "../test/fixtures/trace-fixtures.js";

const puzzle = await loadPuzzle("3x3x3");
const out: Record<string, { colours: string; scramble: string }> = {};

for (const fixture of TRACE_FIXTURES.filter((f) => f.puzzle === "3x3x3" && f.scramble === undefined)) {
  const colours = constructColours(puzzle, fixture);
  const pattern = coloursToPattern(puzzle, colours);
  const { CORNERS: c, EDGES: e } = pattern.patternData;
  if (c === undefined || e === undefined) throw new Error("missing orbit");
  const problems = [
    permutationParity(c.pieces) !== permutationParity(e.pieces) ? "corner and edge parity differ" : "",
    mod(c.orientation.reduce((a, b) => a + b, 0), 3) !== 0 ? "corner twists don't sum to 0" : "",
    mod(e.orientation.reduce((a, b) => a + b, 0), 2) !== 0 ? "edge flips don't sum to 0" : "",
  ].filter((p) => p !== "");
  if (problems.length > 0) throw new Error(`${fixture.id} is not a reachable state: ${problems.join("; ")}`);

  const solution = await experimentalSolve3x3x3IgnoringCenters(pattern);
  const scramble = new Alg(solution).invert().toString();
  if (!puzzle.kpuzzle.defaultPattern().applyAlg(scramble).isIdentical(pattern)) {
    throw new Error(`${fixture.id}: scramble does not reproduce the constructed state`);
  }
  out[fixture.id] = { colours: colours.join(""), scramble };
  console.log(fixture.id, scramble);
}

const path = join(import.meta.dirname, "..", "test", "fixtures", "trace-scrambles.json");
writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${Object.keys(out).length} scrambles to ${path}`);
