import type { KPattern } from "cubing/kpuzzle";
import type { CubingEvent } from "@bld/cube-engine";

/** Keep relative module-worker imports intact, entirely on this origin. */
async function search() {
  const url = `${window.location.origin}/vendor/cubing/search/index.js`;
  const module = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as typeof import("cubing/search");
  module.setSearchDebug({ logPerf: false, scramblePrefetchLevel: "none" });
  return module;
}
export async function solveBrowserState(pattern: KPattern): Promise<string> {
  return (await (await search()).experimentalSolve3x3x3IgnoringCenters(pattern)).toString();
}
export async function browserEventScramble(event: CubingEvent): Promise<string> {
  const url = `${window.location.origin}/vendor/cubing/scramble/index.js`;
  const module = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as typeof import("cubing/scramble");
  await search();
  return (await module.randomScrambleForEvent(event)).toString();
}
