/**
 * The colour tokens from docs/DESIGN.md, as data. `tokens.css` holds the same values for the browser;
 * palette.test.ts checks the two agree and that every contrast floor in DESIGN.md holds.
 */
export type ThemeName = "dark" | "light";
export type PaletteName = "standard" | "high-contrast" | "deuteranopia";
export type FaceName = "U" | "L" | "F" | "R" | "B" | "D";

export const FACE_ORDER: readonly FaceName[] = ["U", "L", "F", "R", "B", "D"];

export interface InterfaceColours {
  readonly ground: string;
  readonly stage: string;
  readonly text: string;
  readonly textQuiet: string;
  readonly rule: string;
  readonly focus: string;
}

export const INTERFACE: Readonly<Record<ThemeName, InterfaceColours>> = {
  dark: { ground: "#213640", stage: "#29434D", text: "#F0F5F7", textQuiet: "#B1C7D0", rule: "#567582", focus: "#F0F5F7" },
  light: { ground: "#EEF1F2", stage: "#DFE7EB", text: "#223744", textQuiet: "#516673", rule: "#A9B9C1", focus: "#223744" },
};

export const CHALK = INTERFACE.dark.text;
export const INK = INTERFACE.light.text;
export const CUBE_BODY = "#0E0E10";

export const STICKER_PALETTES: Readonly<Record<PaletteName, Readonly<Record<FaceName, string>>>> = {
  standard: { U: "#F4F4F1", F: "#1FA25A", R: "#D63A3A", D: "#FFD23F", L: "#F57C1F", B: "#2B6CD9" },
  "high-contrast": { U: "#FFFFFF", F: "#00B050", R: "#E00000", D: "#FFEE00", L: "#FF8000", B: "#0047FF" },
  // Okabe–Ito colours: red and green become vermillion and bluish green; orange becomes reddish purple.
  deuteranopia: { U: "#FFFFFF", F: "#009E73", R: "#D55E00", D: "#F0E442", L: "#CC79A7", B: "#0072B2" },
};

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** The letter colour for a tile of this face colour: ink or chalk, whichever contrasts more. */
export function tileLetterColour(faceColour: string): "ink" | "chalk" {
  return contrastRatio(faceColour, INK) >= contrastRatio(faceColour, CHALK) ? "ink" : "chalk";
}
