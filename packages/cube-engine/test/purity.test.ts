import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = join(import.meta.dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("cube-engine purity", () => {
  it("imports its public API in a plain Node environment", async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    const api = await import("../src/index.js");
    expect(Object.keys(api).length).toBeGreaterThan(0);
  });

  it("has no imports of UI, storage, rendering or Node modules in src/", () => {
    const forbidden = /from\s+["'](react|react-dom|next|dexie|node:[^"']+|fs|path|cubing\/(?:twisty|bluetooth|stream))(\/[^"']*)?["']/;
    const offenders = sourceFiles(srcDir).filter((file) => forbidden.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => relative(srcDir, file))).toEqual([]);
  });
});
