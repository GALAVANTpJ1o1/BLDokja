"use client";

import { useEffect, useRef } from "react";
import { generateStars, paintStarfield, starCount, type Star } from "./starfield-model";
import { useReducedMotion } from "@/design/motion";

interface NavigatorHints {
  readonly deviceMemory?: number;
  readonly connection?: { readonly saveData?: boolean };
}

function darkThemeActive(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * The persistent star layer behind every page (DESIGN.md, "Constellation layer"). One fixed canvas,
 * aria-hidden and inert. It repaints on scroll, resize and theme change only, never on a timer; in
 * the light theme it isn't drawn at all, and with reduced motion scroll leaves it exactly where it is.
 */
export function Starfield() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (element === null || context === null || context === undefined) return;
    let stars: Star[] = [];
    let frame = 0;

    const layout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const hints = navigator as Navigator & NavigatorHints;
      stars = generateStars(starCount({ width, height, hardwareConcurrency: navigator.hardwareConcurrency, ...(hints.deviceMemory === undefined ? {} : { deviceMemory: hints.deviceMemory }), ...(hints.connection?.saveData === undefined ? {} : { saveData: hints.connection.saveData }) }));
      element.width = Math.round(width * pixelRatio);
      element.height = Math.round(height * pixelRatio);
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
    };

    const paint = () => {
      frame = 0;
      const dark = darkThemeActive();
      element.hidden = !dark;
      if (!dark) return;
      paintStarfield(context, stars, {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        scrollY: window.scrollY,
        reducedMotion,
        ground: token("--ground"),
        chalk: token("--chalk"),
      });
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(paint);
    };
    const onResize = () => {
      layout();
      schedule();
    };

    layout();
    paint();
    window.addEventListener("resize", onResize, { passive: true });
    // With reduced motion, scrolling changes nothing, so it isn't even listened to.
    if (!reducedMotion) window.addEventListener("scroll", schedule, { passive: true });
    const themeWatch = new MutationObserver(schedule);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", schedule);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", schedule);
      themeWatch.disconnect();
      scheme.removeEventListener("change", schedule);
    };
  }, [reducedMotion]);

  return <canvas ref={canvas} aria-hidden="true" className="starfield" />;
}
