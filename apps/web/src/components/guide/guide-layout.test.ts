import { describe, expect, it } from "vitest";
import { CARD_GAP, CARD_WIDTH, EDGE, placeCard, scrollDelta, SPOT_PAD, spotBox, type Box } from "./guide-layout";

const desktop = { width: 1280, height: 800 };
const card = { width: CARD_WIDTH, height: 250 };
const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });

describe("spotBox", () => {
  it("adds breathing room on every side", () => {
    expect(spotBox(box(100, 200, 300, 50))).toEqual({ x: 100 - SPOT_PAD, y: 200 - SPOT_PAD, width: 300 + 2 * SPOT_PAD, height: 50 + 2 * SPOT_PAD });
  });
});

describe("placeCard", () => {
  it("puts the card below a wide target near the top, centred on it, with the arrow under the target's middle", () => {
    const spot = spotBox(box(200, 100, 600, 80));
    const placement = placeCard(spot, card, desktop);
    if (placement.mode !== "beside") throw new Error(`expected beside, got ${placement.mode}`);
    expect(placement.side).toBe("bottom");
    expect(placement.top).toBe(spot.y + spot.height + CARD_GAP);
    expect(placement.left).toBe(spot.x + spot.width / 2 - CARD_WIDTH / 2);
    expect(placement.arrow).toBe(CARD_WIDTH / 2);
  });

  it("goes above a wide target that sits at the bottom of the screen", () => {
    const spot = spotBox(box(200, 640, 600, 80));
    const placement = placeCard(spot, card, desktop);
    if (placement.mode !== "beside") throw new Error("expected beside");
    expect(placement.side).toBe("top");
    expect(placement.top + card.height + CARD_GAP).toBe(spot.y);
  });

  it("goes beside a tall target: right when there is room, left when there is not", () => {
    const leftEdge = placeCard(spotBox(box(40, 150, 240, 500)), card, desktop);
    const rightEdge = placeCard(spotBox(box(1000, 150, 240, 500)), card, desktop);
    if (leftEdge.mode !== "beside" || rightEdge.mode !== "beside") throw new Error("expected beside");
    expect(leftEdge.side).toBe("right");
    expect(rightEdge.side).toBe("left");
  });

  it("keeps the card inside the screen when the target is at a corner", () => {
    const placement = placeCard(spotBox(box(1200, 20, 60, 40)), card, desktop);
    if (placement.mode === "sheet") throw new Error("unexpected sheet");
    expect(placement.left + placement.width).toBeLessThanOrEqual(desktop.width - EDGE);
    expect(placement.left).toBeGreaterThanOrEqual(EDGE);
  });

  it("keeps the arrow off the card's corners", () => {
    const placement = placeCard(spotBox(box(1200, 100, 60, 40)), card, desktop);
    if (placement.mode !== "beside") throw new Error("expected beside");
    expect(placement.arrow).toBeGreaterThanOrEqual(28);
    expect(placement.arrow).toBeLessThanOrEqual(placement.width - 28);
  });

  it("puts the card over a target as big as the screen, at the edge away from its middle, with no arrow", () => {
    const placement = placeCard(spotBox(box(0, 0, 1280, 800)), card, desktop);
    expect(placement.mode).toBe("over");
  });

  it("docks the phone sheet along the top for a target pinned to the bottom of the screen", () => {
    const phone = { width: 375, height: 812 };
    const tabBar = spotBox(box(0, 748, 375, 64));
    expect(placeCard(tabBar, card, phone, true)).toEqual({ mode: "sheet", dock: "top" });
    // Not pinned, or pinned in the upper half: the sheet stays at the bottom.
    expect(placeCard(tabBar, card, phone)).toEqual({ mode: "sheet", dock: "bottom" });
    expect(placeCard(spotBox(box(0, 0, 375, 64)), card, phone, true)).toEqual({ mode: "sheet", dock: "bottom" });
  });

  it("docks as a sheet on a phone, whatever the target", () => {
    expect(placeCard(spotBox(box(20, 100, 300, 80)), card, { width: 375, height: 812 })).toEqual({ mode: "sheet", dock: "bottom" });
    expect(placeCard(spotBox(box(20, 100, 200, 80)), card, { width: 639, height: 900 })).toEqual({ mode: "sheet", dock: "bottom" });
    expect(placeCard(spotBox(box(20, 100, 200, 80)), card, { width: 640, height: 900 }).mode).not.toBe("sheet");
  });

  it("always leaves the whole card on screen, for any target on any screen from a small tablet up", () => {
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return (seed / 4294967296) * n;
    };
    for (let run = 0; run < 2000; run++) {
      const viewport = { width: 640 + random(1300), height: 520 + random(700) };
      const target = box(random(viewport.width), random(viewport.height), 20 + random(viewport.width), 20 + random(viewport.height));
      const placement = placeCard(spotBox(target), card, viewport);
      if (placement.mode === "sheet") throw new Error("sheet on a wide screen");
      expect(placement.left, JSON.stringify({ viewport, target })).toBeGreaterThanOrEqual(EDGE - 0.001);
      expect(placement.left + placement.width).toBeLessThanOrEqual(viewport.width - EDGE + 0.001);
      expect(placement.top).toBeGreaterThanOrEqual(EDGE - 0.001);
      expect(placement.top + card.height).toBeLessThanOrEqual(viewport.height - EDGE + 0.001);
    }
  });
});

describe("scrollDelta", () => {
  const free = { top: 16, bottom: 0 };

  it("does not scroll a target that is already fully visible", () => {
    expect(scrollDelta(box(100, 200, 400, 100), desktop, free)).toBe(0);
  });

  it("scrolls down to centre a target that is below the fold, and up for one above it", () => {
    const below = scrollDelta(box(100, 1400, 400, 100), desktop, free);
    const above = scrollDelta(box(100, -600, 400, 100), desktop, free);
    expect(below).toBeGreaterThan(0);
    expect(above).toBeLessThan(0);
    // After scrolling, the target's middle is the middle of the free area.
    expect(1450 - below).toBeCloseTo(16 + (800 - 16) / 2);
  });

  it("lines a target taller than the free space up by its top, so its start is what you see", () => {
    expect(scrollDelta(box(100, 500, 400, 2000), desktop, free)).toBe(500 - SPOT_PAD - 16);
  });

  it("leaves room for a card docked at the bottom", () => {
    const sheet = { top: 16, bottom: 300 };
    // Visible on a bare screen (bottom edge 700) but underneath a 300px sheet (free area ends at 500).
    expect(scrollDelta(box(20, 600, 300, 100), { width: 375, height: 812 }, { top: 16, bottom: 0 })).toBe(0);
    expect(scrollDelta(box(20, 600, 300, 100), { width: 375, height: 812 }, sheet)).toBeGreaterThan(0);
  });
});
