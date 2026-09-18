"use client";

import { CubeIcon } from "@phosphor-icons/react";
import { createRng, loadPuzzle, randomMoveSequence, verifiedMoves } from "@bld/cube-engine";
import type { TwistyPlayer } from "cubing/twisty";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { installPlayerPalette } from "./player-palette";

const SEQUENCE_LENGTH = 20;

/**
 * A small, decorative cube that idles through random legal moves while something else loads (the
 * plan's "custom loading experience"). Every move comes from verifiedMoves()/randomMoveSequence()
 * (packages/cube-engine/src/random/random-state.ts) -- the same engine-tested building blocks
 * NavigationCube uses for its own routes, never a hand-picked sequence.
 *
 * Deliberately simpler than NavigationCube: there is no destination pattern to route to, just "keep
 * moving" for as long as this is mounted, which is only ever while its caller is actually loading.
 */
export function LoadingCube() {
  const { settings } = useSettings();
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (container === null) return;
    const life = { disposed: false };
    // Same reasoning as NavigationCube (docs/DECISIONS.md D-050 area): reading through a call, not
    // the bare property, because TypeScript can't see this async IIFE interleaving with the effect
    // cleanup below, which sets life.disposed from a separate closure.
    const isDisposed = () => life.disposed;
    let player: TwistyPlayer | undefined;
    let running = false;
    let visible = true;
    let suspended = false;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let removeListener = () => {};
    const available = () => !document.hidden && visible;
    const moves = verifiedMoves("3x3x3");
    const rng = createRng(Date.now());

    const spin = () => {
      if (isDisposed() || player === undefined) return;
      running = true;
      player.alg = randomMoveSequence(rng, moves, SEQUENCE_LENGTH).join(" ");
      player.jumpToStart();
      if (media.matches) player.jumpToEnd();
      else if (available()) player.play();
      else suspended = true;
    };
    const visibility = () => {
      if (player === undefined) return;
      if (!available()) { suspended = true; player.pause(); }
      else if (suspended) {
        suspended = false;
        if (media.matches) player.jumpToEnd(); else player.play();
      }
    };
    const reduction = () => { if (running) player?.jumpToEnd(); };
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
        await loadPuzzle("3x3x3");
        const { TwistyPlayer: Player } = await import("cubing/twisty");
        if (life.disposed) return;
        const current = new Player({
          puzzle: "3x3x3", visualization: "PG3D", hintFacelets: "none", background: "none",
          controlPanel: "none", experimentalDragInput: "none", alg: "", tempoScale: 2.4,
          cameraLatitude: 28, cameraLongitude: 35,
        });
        current.style.width = "100%";
        current.style.height = "100%";
        player = current;
        container.replaceChildren(current);
        const timelineListener: Parameters<typeof current.experimentalModel.detailedTimelineInfo.addFreshListener>[0] = (info) => {
          if (isDisposed() || !info.atEnd || !running) return;
          spin();
        };
        current.experimentalModel.detailedTimelineInfo.addFreshListener(timelineListener);
        removeListener = () => { current.experimentalModel.detailedTimelineInfo.removeFreshListener(timelineListener); };
        const vantages = await current.experimentalCurrentVantages();
        await Promise.all(Array.from(vantages, (vantage) => vantage.render()));
        if (!isDisposed()) { setReady(true); spin(); }
      } catch (error) {
        console.error("loading cube: unable to load 3D", error);
      }
    })();

    return () => {
      life.disposed = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", reduction);
      removeListener();
      player?.pause();
      player?.remove();
    };
  }, [settings.palette]);

  return (
    <div className="relative mx-auto h-24 w-24">
      <div ref={host} className="h-full w-full" aria-hidden />
      {!ready ? <CubeIcon className="absolute inset-0 m-auto h-12 w-12 animate-pulse text-quiet" weight="light" aria-hidden /> : null}
    </div>
  );
}
