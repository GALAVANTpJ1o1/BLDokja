/**
 *   pnpm engine:bench comms    → comm search time budget (DECISIONS D-019)
 */
import { benchCommSearch } from "./bench-comm-search.js";

const benches: Record<string, (args: readonly string[]) => Promise<void>> = {
  comms: benchCommSearch,
};

const name = process.argv[2];
const run = name === undefined ? undefined : benches[name];
if (run === undefined) {
  console.error(`usage: pnpm engine:bench <${Object.keys(benches).join(" | ")}>`);
  process.exit(1);
}
await run(process.argv.slice(3));
