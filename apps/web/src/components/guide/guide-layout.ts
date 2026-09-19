/**
 * Where a page guide's spotlight and card go, as pure functions of rectangles so the geometry can be
 * tested without a browser. All boxes are in viewport coordinates.
 */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export type Side = "top" | "bottom" | "left" | "right";

/** Room left around the highlighted element inside the spotlight, so its own focus ring and shadow show. */
export const SPOT_PAD = 12;
/** Distance from the spotlight to the card; the arrow occupies the middle of it. */
export const CARD_GAP = 22;
/** The card never gets closer than this to the edge of the screen. */
export const EDGE = 12;
export const CARD_WIDTH = 340;
/** Below this width the card docks along the bottom of the screen, like a sheet, instead of sitting beside the target. */
export const SHEET_BELOW = 640;
/** How far the arrow stays from the card's corners. */
const ARROW_INSET = 28;

export type Placement =
  | { readonly mode: "beside"; readonly left: number; readonly top: number; readonly width: number; readonly side: Side; readonly arrow: number }
  | { readonly mode: "over"; readonly left: number; readonly top: number; readonly width: number }
  | { readonly mode: "sheet"; readonly dock: "top" | "bottom" };

/** The target's rectangle plus the breathing room, which is what the spotlight actually cuts out. */
export function spotBox(target: Box): Box {
  return { x: target.x - SPOT_PAD, y: target.y - SPOT_PAD, width: target.width + 2 * SPOT_PAD, height: target.height + 2 * SPOT_PAD };
}

export function cardWidth(viewport: Size): number {
  return Math.min(CARD_WIDTH, viewport.width - 2 * EDGE);
}

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), Math.max(low, high));

/**
 * Chooses a side of the spotlight for the card. Wide targets prefer below then above; tall ones prefer
 * beside. The first side where the whole card fits on screen wins. `pinned` says the target is fixed to the
 * screen, which only matters for the phone sheet. If none fits (a target as big as the
 * screen), the card sits over the target at the edge farther from its middle, with no arrow.
 */
export function placeCard(spot: Box, card: Size, viewport: Size, pinned = false): Placement {
  // A phone's sheet docks along the bottom. A target pinned to the screen (a fixed bottom tab bar) cannot be
  // scrolled out from under it, so when it sits in the lower half the sheet docks along the top instead.
  if (viewport.width < SHEET_BELOW) return { mode: "sheet", dock: pinned && spot.y + spot.height / 2 > viewport.height / 2 ? "top" : "bottom" };
  const width = cardWidth(viewport);
  const centreX = spot.x + spot.width / 2;
  const centreY = spot.y + spot.height / 2;
  const acrossLeft = clamp(centreX - width / 2, EDGE, viewport.width - width - EDGE);
  const alongTop = clamp(centreY - card.height / 2, EDGE, viewport.height - card.height - EDGE);
  const candidates: Record<Side, { left: number; top: number; fits: boolean; arrow: number }> = {
    bottom: { left: acrossLeft, top: spot.y + spot.height + CARD_GAP, fits: spot.y + spot.height + CARD_GAP + card.height <= viewport.height - EDGE, arrow: clamp(centreX - acrossLeft, ARROW_INSET, width - ARROW_INSET) },
    top: { left: acrossLeft, top: spot.y - CARD_GAP - card.height, fits: spot.y - CARD_GAP - card.height >= EDGE, arrow: clamp(centreX - acrossLeft, ARROW_INSET, width - ARROW_INSET) },
    right: { left: spot.x + spot.width + CARD_GAP, top: alongTop, fits: spot.x + spot.width + CARD_GAP + width <= viewport.width - EDGE, arrow: clamp(centreY - alongTop, ARROW_INSET, card.height - ARROW_INSET) },
    left: { left: spot.x - CARD_GAP - width, top: alongTop, fits: spot.x - CARD_GAP - width >= EDGE, arrow: clamp(centreY - alongTop, ARROW_INSET, card.height - ARROW_INSET) },
  };
  const order: readonly Side[] = spot.width >= spot.height * 1.2 ? ["bottom", "top", "right", "left"] : ["right", "left", "bottom", "top"];
  for (const side of order) {
    const c = candidates[side];
    if (c.fits) return { mode: "beside", left: c.left, top: c.top, width, side, arrow: c.arrow };
  }
  const top = centreY > viewport.height / 2 ? EDGE : viewport.height - card.height - EDGE;
  return { mode: "over", left: acrossLeft, top: Math.max(EDGE, top), width };
}

/**
 * How far to scroll the page so a target is fully on screen and clear of whatever the card will cover.
 * `reserved` is the strip at the bottom the card takes when docked as a sheet (0 otherwise). A target
 * taller than the free space is lined up by its top edge, so its start is what you see.
 */
export function scrollDelta(target: Box, viewport: Size, reserved: { readonly top: number; readonly bottom: number }): number {
  const freeTop = reserved.top;
  const freeBottom = viewport.height - reserved.bottom;
  const free = freeBottom - freeTop;
  if (target.height + 2 * SPOT_PAD >= free) return target.y - SPOT_PAD - freeTop;
  if (target.y - SPOT_PAD >= freeTop && target.y + target.height + SPOT_PAD <= freeBottom) return 0;
  return target.y + target.height / 2 - (freeTop + free / 2);
}
