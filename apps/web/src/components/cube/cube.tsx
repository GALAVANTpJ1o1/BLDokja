"use client";

import { expandNodes, faceletsOf, formatMoves, parseAlg, stickerName, type PuzzleId } from "@bld/cube-engine";
import type { TwistyPlayer } from "cubing/twisty";
import { ArrowCounterClockwiseIcon, CaretLeftIcon, CaretRightIcon, PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { en } from "@/i18n/en";
import { polish } from "@/i18n/polish";
import { describeCube, netCells, patternFor, playerMask, revealedCells } from "./cube-state";
import { installPlayerPalette } from "./player-palette";
import { StickerNet } from "./sticker-net";
import { usePuzzle } from "./use-puzzle";

export interface CubeProps {
  /** Only the home hero eagerly loads 3D; teaching cubes offer a precise net first. */
  readonly eager?: boolean;
  /** A compact product-signature cube may stay spatial without changing the reader's lesson cube preference. */
  readonly force3D?: boolean;
  /** Which cube. 4x4x4 draws the same way, with a 4×4 net as its fallback. */
  readonly puzzleId?: PuzzleId;
  /** The state shown before `alg`, as moves from solved (a scramble or a case setup). */
  readonly setup?: string;
  /** The moves to animate. */
  readonly alg?: string;
  /**
   * Slots to point at, by sticker name ("UFR", "FU"). They and the rest of their pieces are shown at full
   * strength: naming one sticker of a corner lights all three, because one colour fits four positions and
   * only all of a piece's colours say which piece it is. The fixed centres always keep their colour.
   * Everything else is dimmed. Slots are read in the setup state, and the mask follows those stickers
   * while the alg plays. In the net the named stickers also carry a ring, so which one is being asked
   * about doesn't rest on colour alone; the 3D player has no ring, so a prompt that asks about one
   * sticker of a lit piece should say which face it is on.
   */
  readonly highlight?: readonly string[];
  /** Guided recognition: the fixed centres and the highlighted pieces are shown; other pieces have no colour hints. */
  readonly revealOnly?: boolean;
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

/**
 * Whether an element is on screen or within 200px of it, and stays true once it has been. The 3D player is
 * the most expensive thing on a page; a lesson with five cubes builds only the ones you scroll towards.
 */
function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const element = ref.current;
    if (near || element === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref, near]);
  return near;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The cube component every lesson and trainer uses (BRIEF §3). cubing.js's 3D player, with the three
 * hidden faces floating beside the cube (your 2026-09-15 answer), stickering masks computed by the
 * engine, sticker colours from the palette tokens, and a text description for screen readers. If the
 * 3D player can't load, the same state is shown as a flat net.
 */
export function Cube({ puzzleId = "3x3x3", setup = "", alg = "", highlight, revealOnly = false, dim = "strong", controls = false, autoplay = false, eager = false, force3D = false, label, tempo = 1, className }: CubeProps) {
  const puzzle = usePuzzle(puzzleId);
  const { settings, threeDRequested, request3D } = useSettings();
  const sceneRequested = eager || force3D || threeDRequested || autoplay;
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const player = useRef<TwistyPlayer | null>(null);
  const near = useNearViewport(stage);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string>();
  const playerKey = JSON.stringify([puzzleId, setup, alg, tempo, autoplay, settings.palette, settings.cubeView]);
  const [replay, setReplay] = useState({ key: `${setup}|${alg}`, index: 0 });
  const moves = useMemo(() => {
    const parsed = parseAlg(puzzleId, alg);
    return parsed.ok ? expandNodes(parsed.value.nodes) : [];
  }, [puzzleId, alg]);
  const replayKey = `${setup}|${alg}`;
  const replayIndex = controls ? (replay.key === replayKey ? Math.min(replay.index, moves.length) : 0) : moves.length;
  const replayPattern = useMemo(() => puzzle === undefined ? undefined : patternFor(puzzle, `${setup} ${formatMoves(moves.slice(0, replayIndex))}`), [puzzle, setup, moves, replayIndex]);
  const moveTo = (index: number) => { setReplay({ key: replayKey, index }); };
  const highlightKey = highlight?.join(",") ?? "";

  const setupPattern = useMemo(() => (puzzle === undefined ? undefined : patternFor(puzzle, setup)), [puzzle, setup]);
  const netHighlight = useMemo(() => {
    if (puzzle === undefined || setupPattern === undefined || replayPattern === undefined || highlightKey === "") return undefined;
    const names = new Set(highlightKey.split(","));
    const initial = faceletsOf(puzzle, setupPattern);
    const selected = new Set(puzzle.geometry.stickers.filter((sticker) => names.has(stickerName(puzzle.geometry, sticker.index))).map((sticker) => initial[sticker.index]));
    const current = faceletsOf(puzzle, replayPattern);
    return new Set(puzzle.geometry.stickers.filter((sticker) => selected.has(current[sticker.index])).map((sticker) => sticker.index));
  }, [puzzle, setupPattern, replayPattern, highlightKey]);
  const finalPattern = useMemo(() => (puzzle === undefined ? undefined : patternFor(puzzle, `${setup} ${alg}`)), [puzzle, setup, alg]);
  const revealedNames = useMemo(() => {
    if (puzzle === undefined || replayPattern === undefined || !revealOnly || netHighlight === undefined) return undefined;
    return revealedCells(netCells(puzzle, replayPattern), puzzle.size, netHighlight);
  }, [puzzle, replayPattern, revealOnly, netHighlight]);
  const description = useMemo(() => (puzzle === undefined || replayPattern === undefined ? [] : describeCube(netCells(puzzle, replayPattern), revealedNames)), [puzzle, replayPattern, revealedNames]);
  // With no highlight, every facelet is regular: setting this mask clears an earlier highlight on a live player.
  const mask = useMemo(() => {
    if (puzzle === undefined || setupPattern === undefined) return undefined;
    return playerMask(puzzle, setupPattern, new Set(highlightKey === "" ? [] : highlightKey.split(",")), dim);
  }, [puzzle, setupPattern, highlightKey, dim]);
  const maskRef = useRef(mask);
  useEffect(() => {
    maskRef.current = mask;
    if (player.current !== null && mask !== undefined) player.current.experimentalStickeringMaskOrbits = mask;
  }, [mask]);

  useEffect(() => {
    const container = host.current;
    // A signature cube deliberately stays spatial even when the reader has chosen nets for
    // instructional cubes.  Previously force3D requested a scene but this guard still rejected
    // it when the saved preference was "net", leaving the compact navigation cube in its loading
    // fallback indefinitely.
    if (container === null || !near || !sceneRequested || puzzle === undefined || setupPattern === undefined || (!force3D && settings.cubeView !== "3d")) return;
    const life = { disposed: false };
    const active = () => !life.disposed;
    let created: TwistyPlayer | null = null;
    void (async () => {
      try {
        await installPlayerPalette(puzzleId);
        const { TwistyPlayer: Player } = await import("cubing/twisty");
        if (!active()) return;
        const initialMask = maskRef.current;
        created = new Player({
          puzzle: puzzleId,
          visualization: "PG3D",
          hintFacelets: eager ? "none" : "floating",
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
        const vantages = await created.experimentalCurrentVantages();
        await Promise.all(Array.from(vantages, (vantage) => vantage.render()));
        if (active()) setLoadedKey(playerKey);
      } catch (error) {
        console.error("cube: the 3D player failed to load", error);
        if (active()) setFailed(true);
      }
    })();
    return () => {
      life.disposed = true;
      created?.pause();
      created?.remove();
      player.current = null;
    };
    // The palette is read when the player is created, so a palette change remounts it. Highlight changes
    // don't: the mask effect above updates the live player.
  }, [near, sceneRequested, puzzle, puzzleId, setupPattern, setup, alg, tempo, autoplay, eager, force3D, settings.palette, settings.cubeView, playerKey]);

  const act = (fn: (p: TwistyPlayer) => void) => {
    if (player.current !== null) fn(player.current);
  };

  const ready = puzzle !== undefined && finalPattern !== undefined;
  // "text" writes the state out instead of drawing it; "net" skips the 3D player, which also loads nothing.
  const showNet = ready && (failed || (!force3D && settings.cubeView === "net") || !sceneRequested);
  const showText = !force3D && settings.cubeView === "text";
  const fallbackControls = controls && moves.length > 0 ? <div className="flex flex-col gap-2">
    <p className="t-meta text-quiet" role="status">{polish.cube.position(replayIndex, moves.length)}{replayIndex > 0 ? ` · ${formatMoves(moves.slice(replayIndex - 1, replayIndex))}` : ""}</p>
    <div className="control-row" role="group" aria-label={label}>
      <button type="button" className="btn" disabled={replayIndex === 0} onClick={() => { moveTo(0); }}>{en.cube.restart}</button>
      <button type="button" className="btn" disabled={replayIndex === 0} onClick={() => { moveTo(replayIndex - 1); }}>{en.cube.stepBack}</button>
      <button type="button" className="btn btn-strong" disabled={replayIndex === moves.length} onClick={() => { moveTo(replayIndex + 1); }}>{en.cube.stepForward}</button>
    </div>
  </div> : null;
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
          {(ready && replayPattern !== undefined ? describeCube(netCells(puzzle, replayPattern), revealedNames) : [en.cube.loading]).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        {fallbackControls}
      </figure>
    );
  }
  return (
    <figure className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div ref={stage} className="cube-stage" aria-hidden={!showNet}>
        {showNet ? (
          <StickerNet cells={netCells(puzzle, replayPattern ?? finalPattern)} size={puzzle.size} highlight={netHighlight} hideUnrevealed={revealOnly} label={label} className="h-full w-full p-3" />
        ) : (
          <><div ref={host} className="h-full w-full" />{ready && loadedKey !== playerKey ? <div className="absolute inset-0 pointer-events-none"><StickerNet cells={netCells(puzzle, setupPattern ?? finalPattern)} size={puzzle.size} highlight={netHighlight} hideUnrevealed={revealOnly} label={label} className="h-full w-full p-3" /></div> : null}</>
        )}
        {puzzle === undefined ? <p className="absolute inset-0 grid place-items-center t-meta text-quiet">{en.cube.loading}</p> : null}
      </div>
      <figcaption className="sr-only">
        {label}. {description.join(" ")}
      </figcaption>
      {failed ? <p className="t-meta text-quiet">{en.cube.failed}</p> : null}
      {settings.cubeView === "3d" && !sceneRequested && !failed ? <button type="button" className="btn self-center" onClick={request3D}>{polish.cube3D}</button> : null}
      {showNet ? fallbackControls : null}
      {/* Only the 3D player animates, so the step controls belong to it. */}
      {controls && alg !== "" && !showNet ? (
        <div className="cube-controls" role="group" aria-label={label}>
          <button type="button" className="btn" onClick={() => { act((p) => { p.jumpToStart(); }); setPlaying(false); }}>
            <ArrowCounterClockwiseIcon size={16} aria-hidden />{en.cube.restart}
          </button>
          <button type="button" className="btn" onClick={() => { act((p) => { p.controller.animationController.play(STEP_BACK); }); }}>
            <CaretLeftIcon size={16} aria-hidden />{en.cube.stepBack}
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
            {playing ? <PauseIcon size={16} weight="fill" aria-hidden /> : <PlayIcon size={16} weight="fill" aria-hidden />}{playing ? en.cube.pause : en.cube.play}
          </button>
          <button type="button" className="btn" onClick={() => { act((p) => { p.controller.animationController.play(STEP_FORWARD); }); }}>
            {en.cube.stepForward}<CaretRightIcon size={16} aria-hidden />
          </button>
        </div>
      ) : null}
    </figure>
  );
}
