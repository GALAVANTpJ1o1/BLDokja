import type { KPattern } from "cubing/kpuzzle";
import { slotViews, type SlotView } from "../display/stickering.js";
import type { Puzzle } from "../core/puzzle.js";

/**
 * Cube rendering presets (polish brief §53-54). Each mode is a pure rule that says, for every sticker slot,
 * whether it is drawn normally, highlighted, dimmed or hidden, so a page never re-implements "what should the
 * learner see for this task". Consumers: the flat net, the SVG recognition diagrams, and the 3D cube's
 * highlight list.
 *
 * The principle (§54): show only what the current task needs, and never remove information the task needs.
 * PLL keeps the side stickers of the top layer, OLL keeps the corners, F2L keeps the centres and the cross.
 */
export const CUBE_RENDER_MODES = [
  "FULL_CUBE", "F2L_SINGLE_PAIR", "F2L_MULTI_PAIR", "OLL_EDGE_RECOGNITION", "OLL_FULL_RECOGNITION", "PLL_RECOGNITION", "BLD_FULL",
] as const;
export type CubeRenderMode = (typeof CUBE_RENDER_MODES)[number];
export type StickerVisibility = "normal" | "highlight" | "dim" | "hidden";

export interface RenderPlan {
  readonly mode: CubeRenderMode;
  /** Visibility of every slot, by slot name ("UFR", "FUR", "U"...). */
  readonly visibility: ReadonlyMap<string, StickerVisibility>;
  /** Slots to point at (their whole pieces are lit): what `Cube`'s `highlight` prop takes. */
  readonly highlight: readonly string[];
  /** The slots a pair belongs in: emphasised on the F2L modes, empty elsewhere. */
  readonly target: readonly string[];
  /** Whether a plain-colour view should blank what it dims (recognition drills must not give colours away). */
  readonly blankDimmed: boolean;
}

const CROSS_EDGES = ["DF", "DR", "DB", "DL"] as const;
/** The front-right slot every F2L page teaches in: its corner, its edge and the stickers around them. */
export const F2L_SLOT = { corner: "DFR", edge: "FR" } as const;
const TOP_LAYER_PIECES = new Set(["UF", "UR", "UB", "UL", "UFR", "UBR", "UBL", "UFL"]);

function stickerHomePiece(sticker: string): string {
  return Array.from(sticker).sort().join("");
}

/** Which of the 12 F2L-relevant pieces are unsolved: the front-right pair, plus the other three pairs. */
export const F2L_PAIRS = [
  { name: "FR", corner: "DFR", edge: "FR" },
  { name: "FL", corner: "DFL", edge: "FL" },
  { name: "BR", corner: "DBR", edge: "BR" },
  { name: "BL", corner: "DBL", edge: "BL" },
] as const;

function pieceSlots(views: readonly SlotView[], home: string): string[] {
  return views.filter((v) => stickerHomePiece(v.sticker) === Array.from(home).sort().join("")).map((v) => v.slot);
}

function pairSolved(views: readonly SlotView[], pair: (typeof F2L_PAIRS)[number]): boolean {
  // Solved means every slot of both pieces' home positions shows the sticker that belongs there.
  return [pair.corner, pair.edge].every((home) => views.filter((v) => v.piece === home).every((v) => v.slot === v.sticker));
}

/**
 * The visibility of every slot for a mode. `pairs` names which F2L pairs are the point of the exercise (default:
 * the front-right pair); other modes ignore it.
 */
export function renderPlan(puzzle: Puzzle, pattern: KPattern, mode: CubeRenderMode, pairs: readonly (typeof F2L_PAIRS)[number]["name"][] = ["FR"]): RenderPlan {
  const views = slotViews(puzzle, pattern);
  const visibility = new Map<string, StickerVisibility>();
  const highlight: string[] = [];
  const target: string[] = [];
  const set = (predicate: (v: SlotView) => StickerVisibility) => { for (const v of views) visibility.set(v.slot, v.slot.length === 1 ? "normal" : predicate(v)); };
  const literalPieces = (v: SlotView) => v.piece;
  switch (mode) {
    case "FULL_CUBE": case "BLD_FULL":
      set(() => "normal");
      break;
    case "F2L_SINGLE_PAIR": case "F2L_MULTI_PAIR": {
      const wanted = F2L_PAIRS.filter((p) => pairs.includes(p.name));
      const lit = new Set<string>();
      for (const pair of wanted) for (const home of [pair.corner, pair.edge]) for (const slot of pieceSlots(views, home)) lit.add(slot);
      const targetSlots = new Set<string>();
      for (const pair of wanted) for (const v of views) if (literalPieces(v) === pair.corner || literalPieces(v) === pair.edge) targetSlots.add(v.slot);
      const crossSlots = new Set(views.filter((v) => (CROSS_EDGES as readonly string[]).includes(v.piece)).map((v) => v.slot));
      set((v) => (lit.has(v.slot) ? "highlight" : crossSlots.has(v.slot) ? "normal" : "dim"));
      highlight.push(...lit);
      target.push(...targetSlots);
      break;
    }
    case "OLL_EDGE_RECOGNITION":
      set((v) => (v.piece.length === 2 && v.piece[0] === "U" ? "highlight" : "hidden"));
      highlight.push(...views.filter((v) => v.piece.length === 2 && v.piece[0] === "U").map((v) => v.slot));
      break;
    case "OLL_FULL_RECOGNITION":
      set((v) => (TOP_LAYER_PIECES.has(v.piece) && v.slot[0] === "U" ? "highlight" : TOP_LAYER_PIECES.has(v.piece) ? "dim" : "hidden"));
      highlight.push(...views.filter((v) => TOP_LAYER_PIECES.has(v.piece)).map((v) => v.slot));
      break;
    case "PLL_RECOGNITION":
      set((v) => (TOP_LAYER_PIECES.has(v.piece) ? (v.slot[0] === "U" ? "dim" : "highlight") : "hidden"));
      highlight.push(...views.filter((v) => TOP_LAYER_PIECES.has(v.piece) && v.slot[0] !== "U").map((v) => v.slot));
      break;
  }
  return { mode, visibility, highlight, target, blankDimmed: mode === "OLL_EDGE_RECOGNITION" || mode === "OLL_FULL_RECOGNITION" || mode === "PLL_RECOGNITION" };
}

/** Which pairs are still unsolved in a state (front-right first). */
export function unsolvedPairs(puzzle: Puzzle, pattern: KPattern): (typeof F2L_PAIRS)[number]["name"][] {
  const views = slotViews(puzzle, pattern);
  return F2L_PAIRS.filter((pair) => !pairSolved(views, pair)).map((pair) => pair.name);
}
