import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPageTransition, transitionKind, TRAVEL_DURATION_MS, TRAVEL_MAX_SCALE, type TransitionDocument } from "@/components/transitions/page-transition";
import { MOTION_MS, prefersReducedMotion, stampMotionPreference, type MotionEnvironment } from "./motion";

// Normalised, so the checks don't depend on git's line-ending conversion.
const css = readFileSync(join(import.meta.dirname, "..", "app", "globals.css"), "utf8").replaceAll("\r\n", "\n");

const env = (reduced: boolean): MotionEnvironment => ({
  matchMedia: (query) => ({ matches: query === "(prefers-reduced-motion: reduce)" && reduced, addEventListener: () => undefined, removeEventListener: () => undefined }),
});

function fakeDocument(withApi: boolean) {
  const dataset: DOMStringMap = {};
  const seen: (string | undefined)[] = [];
  const doc: TransitionDocument = {
    documentElement: { dataset },
    ...(withApi
      ? {
          startViewTransition: (update: () => Promise<void> | void) => {
            seen.push(dataset.transition);
            return { finished: Promise.resolve(update()) };
          },
        }
      : {}),
  };
  return { doc, dataset, seen };
}

describe("reduced motion is read in script, not only by a media query", () => {
  it("reads the preference and stamps it on the root element", () => {
    expect(prefersReducedMotion(env(true))).toBe(true);
    expect(prefersReducedMotion(env(false))).toBe(false);
    expect(prefersReducedMotion(undefined)).toBe(false);
    const root = { dataset: {} as DOMStringMap };
    stampMotionPreference(root, true);
    expect(root.dataset.motion).toBe("reduce");
    stampMotionPreference(root, false);
    expect(root.dataset.motion).toBe("full");
  });
});

describe("page transitions", () => {
  it("travel with full motion, a plain cross-fade with reduced motion, and a plain navigation without the API", async () => {
    for (const [withApi, reduced, expected] of [[true, false, "travel"], [true, true, "fade"], [false, false, "none"], [false, true, "none"]] as const) {
      const { doc, dataset, seen } = fakeDocument(withApi);
      expect(transitionKind(doc, reduced)).toBe(expected);
      let navigations = 0;
      const kind = await runPageTransition(doc, reduced, () => {
        navigations++;
        return Promise.resolve();
      });
      expect(kind).toBe(expected);
      expect(navigations).toBe(1);
      expect(seen).toEqual(withApi ? [expected] : []);
      expect(dataset.transition).toBeUndefined();
    }
  });

  it("still navigates, and leaves nothing unhandled, when the browser skips the animation", async () => {
    // A hidden tab is the usual case: the update callback still runs and `finished` still resolves,
    // but `ready` rejects with InvalidStateError. Vitest fails the run on an unhandled rejection, so
    // nobody handling that rejection shows up here rather than as noise in a reader's console.
    const dataset: DOMStringMap = {};
    const doc: TransitionDocument = {
      documentElement: { dataset },
      startViewTransition: (update: () => Promise<void> | void) => ({
        ready: Promise.reject(new DOMException("Transition was aborted because of invalid state", "InvalidStateError")),
        finished: Promise.resolve(update()),
      }),
    };
    let navigations = 0;
    const kind = await runPageTransition(doc, false, () => {
      navigations++;
      return Promise.resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 20)); // let a stray rejection surface
    expect(kind).toBe("travel");
    expect(navigations).toBe(1);
    expect(dataset.transition).toBeUndefined();
  });

  it("keeps the travel effect small and short, in code and in the stylesheet", () => {
    expect(TRAVEL_MAX_SCALE).toBeLessThan(1.1);
    expect(TRAVEL_DURATION_MS).toBeLessThan(400);
    const scales = [...css.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]));
    expect(scales.length).toBeGreaterThan(0);
    expect(Math.max(...scales)).toBeLessThan(1.1);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.95);
    const transitionRules = css.split("\n").filter((l) => l.includes("::view-transition") && l.includes("animation:"));
    for (const rule of transitionRules) {
      const [duration = "0", delay = "0"] = [...rule.matchAll(/(\d+)ms/g)].map((m) => m[1]);
      expect(Number(duration) + Number(delay), rule).toBeLessThan(400);
    }
  });
});

describe("the stylesheet collapses motion under reduced motion, by media query and by attribute", () => {
  const reducedBlock = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  html::view-transition"));
  const attributeRules = css.split("\n").filter((l) => l.startsWith('html[data-motion="reduce"]'));

  it("the transmission window's entrance is switched off both ways", () => {
    expect(reducedBlock).toMatch(/\.transmission-window\[open\] \.transmission-panel,\s*\.transmission-window\[open\]::backdrop \{ animation: none; \}/);
    expect(css).toContain('html[data-motion="reduce"] .transmission-window[open] .transmission-panel,');
    expect(css).toMatch(/html\[data-motion="reduce"\] \.transmission-window\[open\]::backdrop \{ animation: none; \}/);
  });

  it("the starfield and page transitions become a plain fade with no transform, both ways", () => {
    for (const layer of ["starfield", "page"]) {
      expect(reducedBlock).toContain(`html::view-transition-old(${layer})`);
      expect(reducedBlock).toContain(`html::view-transition-new(${layer})`);
      expect(attributeRules.some((r) => r.includes(`::view-transition-old(${layer})`))).toBe(true);
    }
    expect(attributeRules.join("\n")).not.toMatch(/scale|stars-streak|stars-settle|page-recede|page-arrive/);
    expect(attributeRules.filter((r) => r.includes("{")).every((r) => r.includes("transform: none") || r.includes("animation: none"))).toBe(true);
  });

  it("the fade fallback is a cross-fade, never a hard cut", () => {
    expect(css).toMatch(/html\[data-transition="fade"\]::view-transition-old\(root\) \{ animation: plain-fade-out 160ms/);
    expect(css).toMatch(/@keyframes plain-fade-in \{\s*from \{ opacity: 0; \}\s*to \{ opacity: 1; \}\s*\}/);
  });
});

describe("motion tokens", () => {
  it("match the CSS duration variables", () => {
    const tokens = readFileSync(join(import.meta.dirname, "..", "styles", "workbench-tokens.css"), "utf8");
    for (const [name, ms] of Object.entries(MOTION_MS)) expect(tokens).toContain(`--duration-${name}: ${ms}ms;`);
  });
});
