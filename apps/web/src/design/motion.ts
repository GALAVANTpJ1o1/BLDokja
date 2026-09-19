"use client";

import { useSyncExternalStore } from "react";

/**
 * Reduced motion, read in JavaScript and stamped on <html> as `data-motion="reduce" | "full"`.
 *
 * CSS media queries alone aren't enough (DESIGN-DIRECTION.md §5): canvas drawing and the View
 * Transitions API run in script, and a stylesheet rule can be missed. So every moving part asks this
 * module, and the CSS keys its reduced rules on the attribute as well as on the media query.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

/** Motion durations in ms; kept equal to `--duration-*` in styles/workbench-tokens.css (a test checks this). */
export const MOTION_MS = { fast: 120, ui: 180, layer: 240 } as const;

export interface MotionEnvironment {
  matchMedia(query: string): { matches: boolean; addEventListener(type: "change", listener: () => void): void; removeEventListener(type: "change", listener: () => void): void };
}

export function prefersReducedMotion(env: MotionEnvironment | undefined = typeof window === "undefined" ? undefined : window): boolean {
  return env?.matchMedia(QUERY).matches ?? false;
}

export function stampMotionPreference(root: { dataset: DOMStringMap }, reduced: boolean): void {
  root.dataset.motion = reduced ? "reduce" : "full";
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  const listener = () => {
    stampMotionPreference(document.documentElement, media.matches);
    onChange();
  };
  stampMotionPreference(document.documentElement, media.matches);
  media.addEventListener("change", listener);
  return () => {
    media.removeEventListener("change", listener);
  };
}

/** Reduced motion as React state; server rendering assumes reduced, so nothing moves before hydration. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => prefersReducedMotion(), () => true);
}
