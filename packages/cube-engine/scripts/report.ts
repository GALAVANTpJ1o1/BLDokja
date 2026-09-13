/**
 *   pnpm engine:report letter-pairs    → docs/reports/letter-pair-reachability.md
 */
import { letterPairReport } from "./letter-pair-report.js";

const reports: Record<string, () => Promise<void>> = {
  "letter-pairs": letterPairReport,
};

const name = process.argv[2];
const run = name === undefined ? undefined : reports[name];
if (run === undefined) {
  console.error(`usage: pnpm engine:report <${Object.keys(reports).join(" | ")}>`);
  process.exit(1);
}
await run();
