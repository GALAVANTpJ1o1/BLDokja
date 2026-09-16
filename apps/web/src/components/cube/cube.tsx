"use client";

import { stickeringMask, type FaceletMask, type PuzzleId, type SlotView } from "@bld/cube-engine";
import type { TwistyPlayer } from "cubing/twisty";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { en } from "@/i18n/en";
import { describeCube, netCells, patternFor } from "./cube-state";
import { installPlayerPalette } from "./player-palette";
import { StickerNet } from "./sticker-net";
import { usePuzzle } from "./use-puzzle";

export interface CubeProps {
  /** Which cube. 4x4x4 draws the same way, with a 4×4 net as its fallback. */
  readonly puzzleId?: PuzzleId;
  /** The state shown before `alg`, as moves from solved (a scramble or a case setup). */
  readonly setup?: string;
  /** The moves to animate. */
  readonly alg?: string;
  /**
   * Slots to show at full strength, by sticker name ("UFR", "FU"); everything else is dimmed. Slots
   * are read in the setup state, and the mask follows those stickers while the alg plays.
   */
  readonly highlight?: readonly string[];
  /**
   * How the rest of the cube is shown when `highlight` is set. `strong` (the default) greys it out;
   * `soft` keeps its colours at cubing.js's dim level, which measures about 73% brightness: too subtle
   * to direct attention on its own.
   */
  readonly dim?: "strong" | "soft";
  /** Show play and step controls (only meaningful with an alg). */
  readonly controls?: boolean;
  /** Play the alg once when the cube appears. Ignored under reduced motion. */
  readonly autoplay?: boolean;
  /** Accessible name, e.g. "Cube after the scramble". */
  readonly label: string;
  readonly tempo?: number;
  readonly className?: string;
}

type PlayOptions = Parameters<TwistyPlayer["controller"]["animationController"]["play"]>[0];
// cubing.js declares these enums without exporting them: Direction.Forwards = 1, Backwards = -1, BoundaryType.Move = "move".
const STEP_FORWARD = { direction: 1, untilBoundary: "move" } as unknown as PlayOptions;
const STEP_BACK = { direction: -1, untilBoundary: "move" } as unknown as PlayOptions;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The cube component every lesson and trainer uses (BRIEF §3). cubing.js's 3D player, with the three
 * hidden faces floating beside the cube (your 2026-09-15 answer), stickering masks computed by the
 * engine, sticker colours from the palette tokens, and a text description for screen readers. If the
 * 3D player can't load, the same state is shown as a flat net.
 */
export function Cube({ puzzleId = "3x3x3", setup = "", alg = "", highlight, dim = "strong", controls = false, autoplay = false, label, tempo = 1, className }: CubeProps) {
  const puzzle = usePuzzle(puzzleId);
  const { settings } = useSettings();
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<TwistyPlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const highlightKey = highlight?.join(",") ?? "";

  const setupPattern = useMemo(() => (puzzle === undefined ? undefined : patternFor(puzzle, setup)), [puzzle, setup]);
  const finalPattern = useMemo(() => (puzzle === undefined ? undefined : patternFor(puzzle, `${setup} ${alg}`)), [puzzle, setup, alg]);
  const description = useMemo(() => (puzzle === undefined || setupPattern === undefined ? [] : describeCube(netCells(puzzle, setupPattern))), [puzzle, setupPattern]);
  // With no highlight, every facelet is regular: setting this mask clears an earlier highlight on a live player.
  const mask = useMemo(() => {
    if (puzzle === undefined || setupPattern === undefined) return undefined;
    const chosen = new Set(highlightKey === "" ? [] : highlightKey.split(","));
    return stickeringMask(puzzle, setupPattern, (v: SlotView): FaceletMask => (chosen.size === 0 || chosen.has(v.slot) ? "regular" : dim === "soft" ? "dim" : "ignored"));
  }, [puzzle, setupPattern, highlightKey, dim]);
  const maskRef = useRef(mask);
  useEffect(() => {
    maskRef.current = mask;
    if (player.current !== null && mask !== undefined) player.current.experimentalStickeringMaskOrbits = mask;
  }, [mask]);

  useEffect(() => {
    const container = host.current;
    if (container === null || puzzle === undefined || setupPattern === undefined || settings.cubeView !== "3d") return;
    const life = { disposed: false };
    let created: TwistyPlayer | null = null;
    void (async () => {
      try {
        await installPlayerPalette(puzzleId);
        const { TwistyPlayer: Player } = await import("cubing/twisty");
        if (life.disposed) return;
        const initialMask = maskRef.current;
        created = new Player({
          puzzle: puzzleId,
          visualization: "PG3D",
          hintFacelets: "floating",
          background: "none",
          controlPanel: "none",
          experimentalSetupAlg: setup,
          alg,
          tempoScale: tempo,
          ...(initialMask === undefined ? {} : { experimentalStickeringMaskOrbits: initialMask }),
        });
        created.style.width = "100%";
        created.style.height = "100%";
        container.replaceChildren(created);
        player.current = created;
        if (autoplay && alg !== "" && !prefersReducedMotion()) created.play();
        else if (alg !== "" && prefersReducedMotion()) created.jumpToEnd();
      } catch (error) {
        console.error("cube: the 3D player failed to load", error);
        if (!life.disposed) setFailed(true);
      }
    })();
    return () => {
      life.disposed = true;
      created?.remove();
      player.current = null;
    };
    // The palette is read when the player is created, so a palette change remounts it. Highlight changes
    // don't: the mask effect above updates the live player.
  }, [puzzle, puzzleId, setupPattern, setup, alg, tempo, autoplay, settings.palette, settings.cubeView]);

  const act = (fn: (p: TwistyPlayer) => void) => {
    if (player.current !== null) fn(player.current);
  };

  const ready = puzzle !== undefined && finalPattern !== undefined;
  // "text" writes the state out instead of drawing it; "net" skips the 3D player, which also loads nothing.
  const showNet = ready && (failed || settings.cubeView === "net");
  const showText = settings.cubeView === "text";
  if (showText) {
    return (
      <figure className={`flex flex-col gap-2 ${className ?? ""}`}>
        <p className="t-meta text-quiet">{label}</p>
        {alg === "" ? null : (
          <p className="t-notation">
            {en.cube.moves}: {alg}
          </p>
        )}
        <div className="flex flex-col gap-1 t-body">
          {(ready ? describeCube(netCells(puzzle, finalPattern)) : [en.cube.loading]).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </figure>
    );
  }
  return (
    <figure className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div className="relative aspect-square w-full max-w-[28rem] self-center rounded-[4px] bg-stage" aria-hidden={!showNet}>
        {showNet ? (
          <StickerNet cells={netCells(puzzle, finalPattern)} size={puzzle.size} label={label} className="h-full w-full p-3" />
        ) : (
          <div ref={host} className="h-full w-full" />
        )}
        {puzzle === undefined ? <p className="absolute inset-0 grid place-items-center t-meta text-quiet">{en.cube.loading}</p> : null}
      </div>
      <figcaption className="sr-only">
        {label}. {description.join(" ")}
      </figcaption>
      {failed ? <p className="t-meta text-quiet">{en.cube.failed}</p> : null}
      {/* Only the 3D player animates, so the step controls belong to it. */}
      {controls && alg !== "" && !showNet ? (
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={label}>
          <button type="button" className="btn" onClick={() => { act((p) => { p.jumpToStart(); }); setPlaying(false); }}>
            {en.cube.restart}
          </button>
          <button type="button" className="btn" onClick={() => { act((p) => { p.controller.animationController.play(STEP_BACK); }); }}>
            {en.cube.stepBack}
          </button>
          <button
            type="button"
            className="btn btn-strong"
            aria-pressed={playing}
            onClick={() => {
              act((p) => {
                p.togglePlay(!playing);
              });
              setPlaying(!playing);
            }}
          >
            {playing ? en.cube.pause : en.cube.play}
          </button>
          <button type="button" className="btn" onClick={() => { act((p) => { p.controller.animationController.play(STEP_FORWARD); }); }}>
            {en.cube.stepForward}
          </button>
        </div>
      ) : null}
    </figure>
  );
}
