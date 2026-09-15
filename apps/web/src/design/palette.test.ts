import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHALK, contrastRatio, CUBE_BODY, FACE_ORDER, INK, INTERFACE, STICKER_PALETTES, tileLetterColour, type PaletteName, type ThemeName } from "./palette";

const css = readFileSync(join(import.meta.dirname, "..", "styles", "tokens.css"), "utf8");

/** The custom properties declared in the first block whose selector matches exactly. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1] ?? "", (m[2] ?? "").toUpperCase()]));
}

describe("design tokens", () => {
  it("tokens.css holds exactly the values in palette.ts", () => {
    const expectInterface = (declared: Record<string, string>, theme: ThemeName) => {
      const t = INTERFACE[theme];
      expect({ ground: declared.ground, stage: declared.stage, text: declared.text, quiet: declared["text-quiet"], rule: declared.rule, focus: declared.focus }).toEqual({
        ground: t.ground,
        stage: t.stage,
        text: t.text,
        quiet: t.textQuiet,
        rule: t.rule,
        focus: t.focus,
      });
    };
    expectInterface(block(":root"), "light");
    expectInterface(block(":root:not([data-theme=\"light\"])"), "dark");
    expectInterface(block(":root[data-theme=\"dark\"]"), "dark");
    const faces = (declared: Record<string, string>) => Object.fromEntries(FACE_ORDER.map((f) => [f, declared[`face-${f.toLowerCase()}`]]));
    expect(faces(block(":root"))).toEqual(STICKER_PALETTES.standard);
    expect(faces(block(":root[data-palette=\"high-contrast\"]"))).toEqual(STICKER_PALETTES["high-contrast"]);
    expect(faces(block(":root[data-palette=\"deuteranopia\"]"))).toEqual(STICKER_PALETTES.deuteranopia);
    expect([block(":root").ink, block(":root").chalk, block(":root")["cube-body"]]).toEqual([INK, CHALK, CUBE_BODY]);
  });

  it.each(["dark", "light"] as const)("meets DESIGN.md's contrast floors in the %s theme", (theme) => {
    const t = INTERFACE[theme];
    const ratios = {
      text: contrastRatio(t.text, t.ground),
      quiet: contrastRatio(t.textQuiet, t.ground),
      textOnStage: contrastRatio(t.text, t.stage),
      quietOnStage: contrastRatio(t.textQuiet, t.stage),
      focus: contrastRatio(t.focus, t.ground),
      rule: contrastRatio(t.rule, t.ground),
    };
    console.log(theme, Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, v.toFixed(2)])));
    expect(ratios.text).toBeGreaterThanOrEqual(7);
    expect(ratios.quiet).toBeGreaterThanOrEqual(4.5);
    expect(ratios.textOnStage).toBeGreaterThanOrEqual(4.5);
    expect(ratios.quietOnStage).toBeGreaterThanOrEqual(4.5);
    expect(ratios.focus).toBeGreaterThanOrEqual(3);
    expect(ratios.rule).toBeGreaterThanOrEqual(1.5);
  });

  it.each(Object.keys(STICKER_PALETTES) as PaletteName[])("every %s tile letter reaches 3:1 (large text), and the six faces are distinct", (palette) => {
    const colours = STICKER_PALETTES[palette];
    for (const face of FACE_ORDER) {
      const colour = colours[face];
      const letter = tileLetterColour(colour) === "ink" ? INK : CHALK;
      expect(contrastRatio(colour, letter), `${palette} ${face}`).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(Object.values(colours)).size).toBe(6);
  });

  it("white and yellow stickers stand out from the cube body", () => {
    for (const palette of Object.values(STICKER_PALETTES)) {
      expect(contrastRatio(palette.U, CUBE_BODY)).toBeGreaterThan(10);
      expect(contrastRatio(palette.D, CUBE_BODY)).toBeGreaterThan(10);
    }
  });
});
