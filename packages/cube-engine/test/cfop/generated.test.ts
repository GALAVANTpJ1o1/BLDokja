import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The committed curated files are what the builders write from their sources (polish brief §56, §80): a hand edit to
 * content/algs/cfop/curated/*.json, or a change to cfop-source.ts / the F2L search without regenerating, fails here.
 */
const root = join(import.meta.dirname, "..", "..");
const check = (script: string) => execFileSync("npx", ["tsx", join("scripts", script), "--check"], { cwd: root, shell: true, encoding: "utf8", stdio: "pipe" });

describe("committed curated data equals what its builder produces", () => {
  it("last-layer sets (owner-supplied tables, verified by the engine)", () => {
    expect(() => check("build-cfop-curated.ts")).not.toThrow();
  }, 180_000);
  it("the 41 F2L reference solutions", () => {
    expect(() => check("build-f2l-curated.ts")).not.toThrow();
  }, 180_000);
  it("the card views (setups, top views, features)", () => {
    expect(() => check("build-cfop-views.ts")).not.toThrow();
  }, 180_000);
});
