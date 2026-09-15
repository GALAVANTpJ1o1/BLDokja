// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInThisContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import { APPEARANCE_KEY } from "@/components/settings/settings-provider";

/** public/appearance-boot.js runs before first paint; it must apply the mirror and never throw. */
const boot = readFileSync(join(process.cwd(), "public", "appearance-boot.js"), "utf8");
// The file is a classic script; run it in the global scope, where the jsdom environment puts document and localStorage.
const run = (): void => {
  runInThisContext(boot);
};

describe("appearance boot script", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.palette;
  });

  it("applies a saved theme and palette from the settings mirror", () => {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme: "light", palette: "deuteranopia" }));
    run();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.palette).toBe("deuteranopia");
  });

  it("leaves the system theme and standard palette alone, and ignores unknown or broken values", () => {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme: "system", palette: "standard" }));
    run();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme: "<script>", palette: "neon" }));
    run();
    expect(document.documentElement.dataset.palette).toBeUndefined();
    localStorage.setItem(APPEARANCE_KEY, "{not json");
    expect(run).not.toThrow();
  });
});
