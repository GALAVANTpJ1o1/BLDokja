import type { KPattern } from "cubing/kpuzzle";
import { faceletsOf, type Puzzle } from "../core/puzzle.js";

/**
 * What a learner sees looking down at the last layer, read from an engine pattern (never from a picture):
 * the nine top stickers and the three stickers of each side that touch the top layer. Colours are face names,
 * "U" being the colour of the U centre, which is the colour of the last layer (yellow in the CFOP and OH
 * orientation profiles; see `orientation.ts`).
 */
export type Colour = "U" | "D" | "F" | "B" | "R" | "L";
export type Side = "front" | "right" | "back" | "left";

export interface TopView {
  /** Rows back to front, columns left to right, as seen from above with the front at the bottom. */
  readonly top: readonly (readonly Colour[])[];
  /** Each side's three stickers in the order they appear around the outside of the diagram: back and front left to right, left and right back to front. */
  readonly back: readonly Colour[];
  readonly right: readonly Colour[];
  readonly front: readonly Colour[];
  readonly left: readonly Colour[];
}

export function topView(puzzle: Puzzle, pattern: KPattern): TopView {
  const facelets = faceletsOf(puzzle, pattern);
  const colourAt = (face: Colour, row: number, col: number): Colour => {
    const slot = puzzle.geometry.stickers.find((s) => s.face === face && s.row === row && s.col === col);
    if (slot === undefined) throw new Error(`no sticker at ${face} ${row},${col}`);
    const home = puzzle.geometry.stickers[facelets[slot.index] ?? slot.index];
    if (home === undefined) throw new Error("bad facelet");
    return home.face;
  };
  const cols = [0, 1, 2] as const;
  return {
    top: [0, 1, 2].map((r) => cols.map((c) => colourAt("U", r, c))),
    back: [2, 1, 0].map((c) => colourAt("B", 0, c)),
    right: [2, 1, 0].map((c) => colourAt("R", 0, c)),
    front: cols.map((c) => colourAt("F", 0, c)),
    left: cols.map((c) => colourAt("L", 0, c)),
  };
}

/** How many of the four edges and four corners show the last-layer colour on top. */
export interface OrientationFeatures {
  readonly orientedEdges: number;
  readonly orientedCorners: number;
  /** Top edges that are oriented, by where they are (back, right, front, left). */
  readonly edgeSides: readonly Side[];
  readonly cornerPlaces: readonly ("back-left" | "back-right" | "front-right" | "front-left")[];
}

export function orientationFeatures(view: TopView): OrientationFeatures {
  const t = view.top;
  const at = (r: number, c: number) => t[r]?.[c] === "U";
  const edgeSides: Side[] = [];
  if (at(0, 1)) edgeSides.push("back");
  if (at(1, 2)) edgeSides.push("right");
  if (at(2, 1)) edgeSides.push("front");
  if (at(1, 0)) edgeSides.push("left");
  const cornerPlaces: OrientationFeatures["cornerPlaces"][number][] = [];
  if (at(0, 0)) cornerPlaces.push("back-left");
  if (at(0, 2)) cornerPlaces.push("back-right");
  if (at(2, 2)) cornerPlaces.push("front-right");
  if (at(2, 0)) cornerPlaces.push("front-left");
  return { orientedEdges: edgeSides.length, orientedCorners: cornerPlaces.length, edgeSides, cornerPlaces };
}

/** What a PLL recognition looks for: solved blocks ("bars", three matching stickers) and headlights (matching corners). */
export interface PermutationFeatures {
  readonly bars: readonly Side[];
  readonly headlights: readonly Side[];
}

export function permutationFeatures(view: TopView): PermutationFeatures {
  const sides: readonly (readonly [Side, readonly Colour[]])[] = [["back", view.back], ["right", view.right], ["front", view.front], ["left", view.left]];
  const bars: Side[] = []; const headlights: Side[] = [];
  for (const [side, strip] of sides) {
    const [a, b, c] = strip;
    if (a === undefined || b === undefined || c === undefined) continue;
    if (a === b && b === c) bars.push(side);
    else if (a === c) headlights.push(side);
  }
  return { bars, headlights };
}
