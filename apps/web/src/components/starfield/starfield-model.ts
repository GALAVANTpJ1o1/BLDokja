// The PRNG alone: the package root would pull the whole engine (and cubing.js) into every page's first load.
import { createRng } from "@bld/cube-engine/prng";

/**
 * The starfield (DESIGN.md, "Constellation layer"): a sticker is a star, a trace is a line between
 * stars. This module is the pure part: how many stars, where they are, what colour they are drawn
 * in, and where they sit for a given scroll position. The canvas component only paints what this
 * returns, so all of it is tested without a browser.
 *
 * Contrast is guaranteed by construction, not by eye: each star is painted opaque, in the ground
 * colour blended toward chalk by at most MAX_STAR_ALPHA, onto a canvas filled with the ground. Stars
 * that overlap (parallax layers slide past each other) overwrite rather than add up, so no pixel is
 * ever brighter than the brightest single star, and starfield.test.ts checks every text role against
 * that brightest colour.
 */

export const MAX_STAR_ALPHA = 0.1;
export const MIN_STAR_ALPHA = 0.04;
/** Scroll-speed factor per depth layer: far, middle, near (DESIGN-DIRECTION.md §3: 0.1–0.3×). */
export const LAYER_SPEEDS = [0.1, 0.2, 0.3] as const;
export type Layer = 0 | 1 | 2;

export interface Star {
  /** Position as a fraction of the field's width and height. */
  readonly x: number;
  readonly y: number;
  readonly layer: Layer;
  /** Radius in CSS pixels. */
  readonly radius: number;
  readonly alpha: number;
}

export interface DeviceHints {
  readonly width: number;
  readonly height: number;
  /** `navigator.deviceMemory` in GB, where the browser exposes it. */
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  /** The user asked for reduced data. */
  readonly saveData?: boolean;
}

/** One star per this many square CSS pixels, before caps. */
const AREA_PER_STAR = 9000;

/**
 * An adaptive star count: proportional to the viewport's area, capped lower on small screens and on
 * devices that say they're low-end, so a phone never carries a desktop's field.
 */
export function starCount(hints: DeviceHints): number {
  const byArea = Math.round((Math.max(0, hints.width) * Math.max(0, hints.height)) / AREA_PER_STAR);
  const small = hints.width < 600;
  const lowEnd = (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) || (hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 4) || hints.saveData === true;
  let cap = small ? 90 : 240;
  if (lowEnd) cap = Math.round(cap / 2);
  return Math.max(0, Math.min(cap, byArea));
}

/**
 * Stars at irregular positions: seeded, so the field doesn't change between visits, and spaced by a
 * best-candidate rule (each new star is the most isolated of a few random tries), which reads as
 * natural scatter rather than a grid or a clump.
 */
export function generateStars(count: number, seed = "bldokja-stars"): Star[] {
  const rng = createRng(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    let best: { x: number; y: number } | undefined;
    let bestDistance = -1;
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = rng.float();
      const y = rng.float();
      let nearest = Infinity;
      for (const s of stars) nearest = Math.min(nearest, (s.x - x) ** 2 + (s.y - y) ** 2);
      if (nearest > bestDistance) [best, bestDistance] = [{ x, y }, nearest];
    }
    const layer = rng.int(3) as Layer;
    const radius = 0.5 + layer * 0.35 + rng.float() * 0.3;
    const alpha = MIN_STAR_ALPHA + (MAX_STAR_ALPHA - MIN_STAR_ALPHA) * (0.35 + 0.65 * rng.float()) * (0.7 + layer * 0.15);
    stars.push({ x: best?.x ?? 0, y: best?.y ?? 0, layer, radius, alpha: Math.min(MAX_STAR_ALPHA, alpha) });
  }
  return stars;
}

/** Where a star is drawn, in CSS pixels, for a scroll position. With reduced motion, scroll changes nothing. */
export function starPosition(star: Star, size: { width: number; height: number }, scrollY: number, reducedMotion: boolean): { x: number; y: number } {
  const shift = reducedMotion ? 0 : scrollY * LAYER_SPEEDS[star.layer];
  const y = (((star.y * size.height - shift) % size.height) + size.height) % size.height;
  return { x: star.x * size.width, y };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The opaque colour a star of this alpha is painted in: the ground blended toward chalk. */
export function starColour(ground: string, chalk: string, alpha: number): string {
  const a = Math.min(MAX_STAR_ALPHA, Math.max(0, alpha));
  const g = hexToRgb(ground);
  const c = hexToRgb(chalk);
  const mixed = g.map((v, i) => Math.round(v + ((c[i] ?? 0) - v) * a));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** The drawing surface the controller needs; a 2D canvas context satisfies it. */
export interface Painter {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

export interface StarfieldState {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly scrollY: number;
  readonly reducedMotion: boolean;
  readonly ground: string;
  readonly chalk: string;
}

/**
 * Paints the whole field for a state. There is no animation loop: the component calls this on scroll,
 * resize and theme changes only, so the field is still unless you move (DESIGN.md principle 3).
 */
export function paintStarfield(painter: Painter, stars: readonly Star[], state: StarfieldState): void {
  painter.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  painter.fillStyle = state.ground;
  painter.fillRect(0, 0, state.width, state.height);
  // Draw far layers first, so near stars sit on top (they overwrite; nothing adds up).
  for (const layer of [0, 1, 2] as const) {
    for (const star of stars) {
      if (star.layer !== layer) continue;
      const { x, y } = starPosition(star, state, state.scrollY, state.reducedMotion);
      painter.fillStyle = starColour(state.ground, state.chalk, star.alpha);
      painter.beginPath();
      painter.arc(x, y, star.radius, 0, Math.PI * 2);
      painter.fill();
    }
  }
}
