"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ENVIRONMENTS } from "@bld/storage/options";
import type { Environment } from "@bld/storage";
import { generateStars, starCount, type Star } from "./starfield-model";
import { paintScenery } from "./scenery-model";
import { useReducedMotion } from "@/design/motion";

interface NavigatorHints { readonly deviceMemory?: number; readonly connection?: { readonly saveData?: boolean } }

function sceneActive(): Environment {
  const value = document.documentElement.dataset.environment;
  return ENVIRONMENTS.find(scene => scene === value) ?? "galaxy";
}

/** One adaptive canvas. Repaints only on deliberate actions; navigation RAF stops after 360ms. */
export function Starfield() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const navigate = useRef<() => void>(() => undefined);
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const element = canvas.current; const ctx = element?.getContext("2d");
    if (element === null || ctx === null || ctx === undefined) return;
    let points: Star[] = []; let frame = 0; let travelUntil = 0;
    const hints = navigator as Navigator & NavigatorHints;
    const lowCost = hints.connection?.saveData === true || (hints.deviceMemory !== undefined && hints.deviceMemory <= 4);
    const ratio = () => Math.min(lowCost ? 1 : 1.5, window.devicePixelRatio || 1);
    const layout = () => {
      points = generateStars(starCount({ width: innerWidth, height: innerHeight, hardwareConcurrency: navigator.hardwareConcurrency, ...(hints.deviceMemory === undefined ? {} : { deviceMemory: hints.deviceMemory }), ...(hints.connection?.saveData === undefined ? {} : { saveData: hints.connection.saveData }) }));
      element.width = Math.round(innerWidth * ratio()); element.height = Math.round(innerHeight * ratio());
      // CSS percentage sizing excludes platform scrollbar gutters; 100vw/innerWidth can create overflow.
      element.style.width = "100%"; element.style.height = "100%";
    };
    const paint = () => {
      frame = 0;
      if (document.hidden) return;
      const scene = sceneActive(); element.hidden = scene === "none";
      if (scene === "none") return;
      const style = getComputedStyle(document.documentElement);
      const remaining = Math.max(0, Math.min(360, travelUntil - performance.now()));
      const travel = Math.sin((1 - remaining / 360) * Math.PI);
      ctx.setTransform(ratio(), 0, 0, ratio(), 0, 0);
      paintScenery(ctx, points, scene, { width: innerWidth, height: innerHeight, scrollY, reducedMotion, travel: remaining > 0 && !lowCost ? travel : 0 }, style.getPropertyValue("--text").trim(), style.getPropertyValue("--accent").trim() || style.getPropertyValue("--text").trim());
      if (remaining > 0 && !reducedMotion && !lowCost) schedule();
    };
    const schedule = () => { if (frame === 0 && !document.hidden) frame = requestAnimationFrame(paint); };
    const onResize = () => { layout(); schedule(); };
    const onVisibility = () => { travelUntil = 0; if (document.hidden && frame !== 0) { cancelAnimationFrame(frame); frame = 0; } else schedule(); };
    navigate.current = () => { if (!reducedMotion && !lowCost) travelUntil = performance.now() + 360; schedule(); };
    layout(); paint();
    window.addEventListener("resize", onResize, { passive: true });
    if (!reducedMotion) window.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    const watch = new MutationObserver(schedule); watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-colourway", "data-environment"] });
    const scheme = matchMedia("(prefers-color-scheme: dark)"); scheme.addEventListener("change", schedule);
    return () => { if (frame !== 0) cancelAnimationFrame(frame); window.removeEventListener("resize", onResize); window.removeEventListener("scroll", schedule); document.removeEventListener("visibilitychange", onVisibility); watch.disconnect(); scheme.removeEventListener("change", schedule); navigate.current = () => undefined; };
  }, [reducedMotion]);
  useEffect(() => { if (previousPath.current !== pathname) { previousPath.current = pathname; navigate.current(); } }, [pathname]);
  return <canvas ref={canvas} aria-hidden="true" className="starfield" />;
}
