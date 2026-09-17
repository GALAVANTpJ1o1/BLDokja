import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLOURWAYS } from "@bld/storage/options";
import { COLOURWAY_COLOURS } from "./appearance";
import { contrastRatio } from "./palette";

const css = readFileSync(join(import.meta.dirname, "../styles/colourways.css"), "utf8");
describe("interface themes", () => {
  it.each(COLOURWAYS)("%s keeps text, controls and focus readable in both tones", id => {
    for (const tone of ["light", "dark"] as const) {
      const c = COLOURWAY_COLOURS[id][tone];
      for (const surface of [c.ground, c.stage]) {
        expect(contrastRatio(c.text, surface), `${id} ${tone} text`).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(c.textQuiet, surface), `${id} ${tone} quiet`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c.focus, surface)).toBeGreaterThanOrEqual(3);
      }
      const selector = tone === "light" ? `:root[data-colourway="${id}"] {` : `:root[data-colourway="${id}"][data-theme="dark"] {`;
      const body = css.slice(css.indexOf(selector) + selector.length).split("}")[0] ?? "";
      for (const [token, colour] of Object.entries(c)) expect(body).toContain(`--${token === "textQuiet" ? "text-quiet" : token}: ${colour};`);
    }
  });
});
