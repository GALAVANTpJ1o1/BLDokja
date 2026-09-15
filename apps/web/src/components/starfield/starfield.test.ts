import { describe, expect, it } from "vitest";
import { contrastRatio, INTERFACE } from "@/design/palette";
import { generateStars, LAYER_SPEEDS, MAX_STAR_ALPHA, paintStarfield, starColour, starCount, starPosition, type Painter, type StarfieldState } from "./starfield-model";

const dark = INTERFACE.dark;

class RecordingPainter implements Painter {
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  private get colour(): string {
    return typeof this.fillStyle === "string" ? this.fillStyle : "pattern";
  }
  readonly calls: string[] = [];
  fillRect(x: number, y: number, w: number, h: number) {
    this.calls.push(`rect ${this.colour} ${x} ${y} ${w} ${h}`);
  }
  beginPath() {}
  arc(x: number, y: number, r: number) {
    this.calls.push(`arc ${this.colour} ${x.toFixed(3)} ${y.toFixed(3)} ${r.toFixed(3)}`);
  }
  fill() {}
  setTransform(a: number) {
    this.calls.push(`transform ${a}`);
  }
}

const state = (overrides: Partial<StarfieldState>): StarfieldState => ({ width: 1280, height: 800, pixelRatio: 1, scrollY: 0, reducedMotion: false, ground: dark.ground, chalk: dark.text, ...overrides });

describe("starCount", () => {
  it("scales with the viewport and caps lower on phones and low-end devices", () => {
    const desktop = starCount({ width: 1920, height: 1080 });
    const laptop = starCount({ width: 1280, height: 800 });
    const phone = starCount({ width: 390, height: 844 });
    const lowEndDesktop = starCount({ width: 1920, height: 1080, deviceMemory: 2 });
    const saveData = starCount({ width: 1920, height: 1080, saveData: true });
    expect(desktop).toBe(230);
    expect(laptop).toBeLessThan(desktop);
    expect(phone).toBeLessThanOrEqual(90);
    expect(lowEndDesktop).toBeLessThanOrEqual(120);
    expect(saveData).toBeLessThanOrEqual(120);
    expect(starCount({ width: 3840, height: 2160 })).toBe(240);
    expect(starCount({ width: 0, height: 800 })).toBe(0);
  });
});

describe("generateStars", () => {
  it("is deterministic, within the alpha cap, on three layers, and not on a grid", () => {
    const stars = generateStars(200);
    expect(generateStars(200)).toEqual(stars);
    expect(stars.every((s) => s.alpha > 0 && s.alpha <= MAX_STAR_ALPHA && s.x >= 0 && s.x < 1 && s.y >= 0 && s.y < 1)).toBe(true);
    expect(new Set(stars.map((s) => s.layer))).toEqual(new Set([0, 1, 2]));
    // A lattice repeats coordinates; scatter doesn't.
    expect(new Set(stars.map((s) => s.x.toFixed(4))).size).toBeGreaterThan(190);
    // Best-candidate spacing: no two stars nearly on top of each other.
    let closest = Infinity;
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const a = stars[i];
        const b = stars[j];
        if (a !== undefined && b !== undefined) closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    expect(closest).toBeGreaterThan(0.004);
  });
});

describe("contrast over the starfield (checked, not eyeballed)", () => {
  it("every text role keeps WCAG AA against the brightest colour any star can be painted", () => {
    const brightest = starColour(dark.ground, dark.text, MAX_STAR_ALPHA);
    const ratios = {
      text: contrastRatio(dark.text, brightest),
      quiet: contrastRatio(dark.textQuiet, brightest),
      focus: contrastRatio(dark.focus, brightest),
    };
    console.log("over the brightest star", brightest, Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, v.toFixed(2)])));
    expect(ratios.text).toBeGreaterThanOrEqual(4.5);
    expect(ratios.quiet).toBeGreaterThanOrEqual(4.5);
    expect(ratios.focus).toBeGreaterThanOrEqual(3);
  });

  it("stars are painted in opaque colours, so overlapping stars can never add up to something brighter", () => {
    const painter = new RecordingPainter();
    paintStarfield(painter, generateStars(240), state({ scrollY: 1234 }));
    const colours = painter.calls.filter((c) => c.startsWith("arc")).map((c) => c.split(" ")[1] ?? "");
    expect(colours.every((c) => /^#[0-9A-F]{6}$/.test(c))).toBe(true);
    const brightest = starColour(dark.ground, dark.text, MAX_STAR_ALPHA);
    const luminanceOf = (hex: string) => Number.parseInt(hex.slice(1), 16);
    expect(colours.every((c) => luminanceOf(c) <= luminanceOf(brightest))).toBe(true);
    expect(starColour(dark.ground, dark.text, 1)).toBe(brightest);
  });
});

describe("parallax, and reduced motion explicitly", () => {
  it("layers move at 0.1×, 0.2× and 0.3× scroll speed", () => {
    expect(LAYER_SPEEDS).toEqual([0.1, 0.2, 0.3]);
    const size = { width: 1000, height: 1000 };
    for (const layer of [0, 1, 2] as const) {
      const star = { x: 0.5, y: 0.5, layer, radius: 1, alpha: 0.05 };
      const moved = 500 - starPosition(star, size, 100, false).y;
      expect(moved).toBeCloseTo(100 * LAYER_SPEEDS[layer], 9);
    }
  });

  it("with reduced motion, scrolling leaves every star exactly where it is: the painted frame is identical at any scroll", () => {
    const stars = generateStars(180);
    const paint = (scrollY: number, reducedMotion: boolean) => {
      const painter = new RecordingPainter();
      paintStarfield(painter, stars, state({ scrollY, reducedMotion }));
      return painter.calls;
    };
    expect(paint(4321, true)).toEqual(paint(0, true));
    expect(paint(4321, false)).not.toEqual(paint(0, false));
    for (const star of stars) expect(starPosition(star, { width: 1280, height: 800 }, 99999, true)).toEqual(starPosition(star, { width: 1280, height: 800 }, 0, true));
  });
});
