import { describe, expect, it } from "vitest";
import { sceneryPosition } from "./scenery-model";
import { generateStars } from "./starfield-model";

describe("action-driven scenery", () => {
  const size = { width: 390, height: 844, reducedMotion: false, scrollY: 0, travel: 0 };
  it("has bounded deterministic depth and trails for scroll/navigation", () => {
    for (const point of generateStars(40)) {
      expect(sceneryPosition(point, size)).toEqual(sceneryPosition(point, size));
      const moved = sceneryPosition(point, { ...size, scrollY: 10000, travel: 20 });
      expect(moved.y).toBeGreaterThanOrEqual(0); expect(moved.y).toBeLessThan(size.height);
      expect(moved.trail).toBeLessThanOrEqual(42);
    }
  });
  it("reduced-motion ignores scroll and navigation completely", () => {
    for (const point of generateStars(40)) expect(sceneryPosition(point, { ...size, reducedMotion: true })).toEqual(sceneryPosition(point, { ...size, reducedMotion: true, scrollY: 9999, travel: 1 }));
  });
});
