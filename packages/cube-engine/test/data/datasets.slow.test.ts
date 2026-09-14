import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateDatasets } from "../../scripts/generate-datasets.js";

/** The committed datasets are exactly what a fresh generation produces (`pnpm engine:generate --check`). */
describe("alg datasets are reproducible", () => {
  it("regenerate byte for byte (line endings aside)", async () => {
    const dir = join(import.meta.dirname, "..", "..", "..", "..", "content", "algs", "3x3");
    const generated = await generateDatasets();
    for (const [name, text] of generated) {
      const path = join(dir, name);
      expect(existsSync(path), name).toBe(true);
      expect(readFileSync(path, "utf8").replace(/\r\n/g, "\n") === text, `${name} is stale: run pnpm engine:generate`).toBe(true);
    }
  });
});
