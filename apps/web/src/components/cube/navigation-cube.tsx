"use client";

import { CubeIcon } from "@phosphor-icons/react";
import { loadPuzzle } from "@bld/cube-engine";
import type { KPattern } from "cubing/kpuzzle";
import type { TwistyPlayer } from "cubing/twisty";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { redesign } from "@/i18n/redesign";
import { installPlayerPalette } from "./player-palette";
import { describeCube, netCells } from "./cube-state";
import { navigationPatterns, navigationRoute, type NavigationPattern } from "./navigation-patterns";

const SOLVED = navigationPatterns[0];

/** One persistent player. Finish the current legal route, then take only the latest requested target.
 * The player's KPattern is authoritative at every move; completed is only a boundary checkpoint.
 * Navigation never waits for animation, and route changes never remount the renderer. */
export function NavigationCube({ signal }: { signal: string }) {
  const { settings } = useSettings();
  const host = useRef<HTMLDivElement>(null);
  const completed = useRef<NavigationPattern>(SOLVED);
  const requested = useRef<NavigationPattern>(SOLVED);
  const logical = useRef<KPattern | null>(null);
  const previousSignal = useRef(signal);
  const pump = useRef<() => void>(() => {});
  const [name, setName] = useState<string>(redesign.patterns.solved);
  const [ready, setReady] = useState(false);
  const [description, setDescription] = useState("");

  const request = useCallback((pattern: NavigationPattern) => {
    requested.current = pattern;
    pump.current();
  }, []);
  useEffect(() => {
    // Initial location starts solved, including React's development effect replay.
    if (signal === previousSignal.current) return;
    previousSignal.current = signal;
    const hash = Array.from(signal).reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
    request(navigationPatterns[1 + hash % (navigationPatterns.length - 1)] ?? SOLVED);
  }, [signal, request]);

  useEffect(() => {
    const container = host.current;
    if (container === null) return;
    const life = { disposed: false };
    let player: TwistyPlayer | undefined;
    let busy = false;
    let running: NavigationPattern | undefined;
    let visible = true;
    let suspended = false;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let removeListeners = () => {};
    const available = () => !document.hidden && visible;
    const drain = async () => {
      const current = player;
      if (life.disposed || current === undefined || busy || !available()) return;
      const target = requested.current;
      if (target.id === completed.current.id) return;
      busy = true;
      current.pause();
      current.experimentalSetupAlg = completed.current.alg;
      current.alg = navigationRoute(completed.current, target);
      current.jumpToStart();
      // Await the new model before enabling the end listener: a stale atEnd cannot commit a target.
      await current.experimentalModel.detailedTimelineInfo.get();
      if (life.disposed) return;
      running = target;
      if (media.matches) current.jumpToEnd();
      else if (available()) current.play();
      else suspended = true;
    };
    pump.current = () => { void drain(); };
    const visibility = () => {
      if (player === undefined) return;
      if (!available()) { suspended = running !== undefined; player.pause(); }
      else if (suspended && running !== undefined) {
        suspended = false;
        if (media.matches) player.jumpToEnd(); else player.play();
      } else { void drain(); }
    };
    const reduction = () => { if (running !== undefined && media.matches) player?.jumpToEnd(); };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      visibility();
    });
    observer.observe(container);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", reduction);
    void (async () => {
      try {
        await installPlayerPalette();
        const puzzle = await loadPuzzle("3x3x3");
        const { TwistyPlayer: Player } = await import("cubing/twisty");
        if (life.disposed) return;
        const current = new Player({ puzzle: "3x3x3", visualization: "PG3D", hintFacelets: "none",
          background: "none", controlPanel: "none", experimentalDragInput: "none",
          experimentalSetupAlg: completed.current.alg, alg: "", tempoScale: 1.8,
          cameraLatitude: 28, cameraLongitude: 35 });
        current.style.width = "100%";
        current.style.height = "100%";
        player = current;
        container.replaceChildren(current);
        const patternListener: Parameters<typeof current.experimentalModel.currentPattern.addFreshListener>[0] = (pattern) => {
          if (life.disposed || logical.current?.isIdentical(pattern)) return;
          logical.current = pattern;
          setDescription(describeCube(netCells(puzzle, pattern)).join(" "));
        };
        const timelineListener: Parameters<typeof current.experimentalModel.detailedTimelineInfo.addFreshListener>[0] = (info) => {
          if (life.disposed || !info.atEnd || running === undefined) return;
          completed.current = running;
          running = undefined;
          busy = false;
          setName(redesign.patterns[completed.current.id]);
          void drain();
        };
        current.experimentalModel.currentPattern.addFreshListener(patternListener);
        current.experimentalModel.detailedTimelineInfo.addFreshListener(timelineListener);
        removeListeners = () => {
          current.experimentalModel.currentPattern.removeFreshListener(patternListener);
          current.experimentalModel.detailedTimelineInfo.removeFreshListener(timelineListener);
        };
        const vantages = await current.experimentalCurrentVantages();
        await Promise.all(Array.from(vantages, (vantage) => vantage.render()));
        if (!life.disposed) { setReady(true); void drain(); }
      } catch (error) { console.error("navigation cube: unable to load 3D", error); }
    })();
    return () => {
      life.disposed = true;
      pump.current = () => {};
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", reduction);
      removeListeners();
      player?.pause();
      // A palette action finishes its legal route before replacing the renderer.
      if (running !== undefined) { player?.jumpToEnd(); completed.current = running; }
      player?.remove();
    };
  }, [settings.palette]);

  const advance = () => {
    const index = navigationPatterns.findIndex((pattern) => pattern.id === requested.current.id);
    request(navigationPatterns[(index + 1) % navigationPatterns.length] ?? SOLVED);
  };
  return <button type="button" className="nav-cube" aria-label={redesign.pattern(name)} onClick={advance} data-pattern={name}>
    <div ref={host} className="nav-cube-host" aria-hidden />
    {!ready ? <CubeIcon className="nav-cube-fallback absolute inset-0" weight="light" aria-hidden /> : null}
    <span className="sr-only">{description}</span>
  </button>;
}
