"use client";

import { crossSolved, f2lSolved, renderPlan, unsolvedPairCount, unsolvedPairs, type CubeRenderMode } from "@bld/cube-engine";
import { ArrowCounterClockwiseIcon, ArrowUUpLeftIcon, LightbulbIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { useSettings } from "@/components/settings/settings-provider";
import { usePuzzle } from "@/components/cube/use-puzzle";
import { cfop } from "@/i18n/cfop";

/**
 * A cube the reader solves with real turns (polish brief §18-20, §22-25). The state is the engine's, updated after every
 * turn; success is a predicate on that state (the lit pairs are home, the cross and other slots are intact), never a
 * comparison with the reference sequence, so any valid solution is accepted (§77). Hints get stronger one at a time; the
 * reference solution plays back on its own cube.
 *
 * Only U, R, L and F turns are offered (§23): no D, B, slices or whole-cube turns, so what the reader sees never changes
 * under them and there is no brute-forcing by orientation.
 */
export const BEGINNER_MOVES = ["U", "U'", "U2", "R", "R'", "R2", "L", "L'", "L2", "F", "F'", "F2"] as const;

export interface BoardResult {
  readonly moves: readonly string[];
  readonly hints: number;
  readonly resets: number;
  readonly elapsedMs: number;
}

export interface F2LBoardProps {
  /** Moves from solved to the starting state. */
  readonly setup: string;
  readonly reference: string;
  readonly referenceMoves: number;
  readonly label: string;
  readonly mode?: Extract<CubeRenderMode, "F2L_SINGLE_PAIR" | "F2L_MULTI_PAIR">;
  readonly hints: readonly string[];
  /** What the reader is told after solving: the idea behind the reference solution. */
  readonly idea?: string;
  readonly onSolved?: (result: BoardResult) => void;
  readonly onGaveUp?: (result: BoardResult) => void;
}

function keyMove(event: KeyboardEvent): string | undefined {
  const face = event.key.length === 1 ? event.key.toUpperCase() : "";
  if (!["U", "R", "L", "F"].includes(face) || event.ctrlKey || event.metaKey || event.altKey) return undefined;
  return event.shiftKey ? `${face}'` : face;
}

export function F2LBoard({ setup, reference, referenceMoves, label, mode = "F2L_SINGLE_PAIR", hints, idea, onSolved, onGaveUp }: F2LBoardProps) {
  const puzzle = usePuzzle("3x3x3");
  const { request3D } = useSettings();
  useEffect(() => { request3D(); }, [request3D]);
  const [moves, setMoves] = useState<readonly string[]>([]);
  const [hintCount, setHintCount] = useState(0);
  const [resets, setResets] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [solved, setSolved] = useState(false);
  // A new case is a new board: the parent gives it a new `key`, so nothing here needs resetting by hand.
  const started = useRef(0);
  const reported = useRef(false);
  useEffect(() => { started.current = performance.now(); }, []);

  const start = useMemo(() => (puzzle === undefined ? undefined : puzzle.kpuzzle.defaultPattern().applyAlg(setup)), [puzzle, setup]);
  const now = useMemo(() => {
    if (start === undefined) return undefined;
    try { return start.applyAlg(moves.join(" ")); } catch { return undefined; }
  }, [start, moves]);
  const plan = useMemo(() => (puzzle === undefined || start === undefined ? undefined : renderPlan(puzzle, start, mode, mode === "F2L_MULTI_PAIR" ? unsolvedPairs(puzzle, start) : ["FR"])), [puzzle, start, mode]);
  const isSolved = now !== undefined && f2lSolved(now);
  const crossOk = now === undefined || crossSolved(now);

  useEffect(() => {
    if (!isSolved || reported.current || moves.length === 0) return;
    reported.current = true;
    setSolved(true);
    onSolved?.({ moves, hints: hintCount, resets, elapsedMs: Math.round(performance.now() - started.current) });
  }, [isSolved, moves, hintCount, resets, onSolved]);

  const turn = useCallback((move: string) => { if (!solved) setMoves((current) => [...current, move]); }, [solved]);
  const undo = () => { if (!solved) setMoves((current) => current.slice(0, -1)); };
  const reset = () => { if (moves.length > 0) { setMoves([]); setResets((n) => n + 1); setSolved(false); reported.current = false; } };
  const giveUp = () => {
    setShowSolution(true);
    if (!reported.current) { reported.current = true; onGaveUp?.({ moves, hints: hintCount, resets, elapsedMs: Math.round(performance.now() - started.current) }); }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = keyMove(event);
    if (move !== undefined) { event.preventDefault(); turn(move); }
  };
  const highlight = plan?.highlight;
  const shownHints = hints.slice(0, hintCount);
  const remaining = now === undefined ? undefined : unsolvedPairCount(now);

  return (
    <div className="cfop-surface two-up" data-guide="f2l-board" data-shortcuts="off">
      <div className="flex flex-col gap-3">
        <Cube setup={setup} liveMoves={moves} label={label} {...(highlight === undefined || highlight.length === 0 ? {} : { highlight })} />
        <p className="t-meta text-quiet" role="status" aria-live="polite">
          {solved ? cfop.f2lPractice.liveSolved : cfop.f2lPractice.liveMoves(moves.length)}{remaining === undefined ? "" : ` · ${cfop.f2lPractice.modeNote(remaining)}`}
        </p>
      </div>
      <div className="flex flex-col gap-4" tabIndex={-1} onKeyDown={onKeyDown}>
        <div role="group" aria-label={cfop.f2lPractice.moveButtons} className="move-pad" data-guide="f2l-moves">
          {BEGINNER_MOVES.map((move) => <button key={move} type="button" className="btn" disabled={solved} onClick={() => { turn(move); }} aria-label={move}>{move}</button>)}
        </div>
        <p className="t-meta text-quiet">{cfop.f2lPractice.keyboard}</p>
        <div className="move-log" aria-label={cfop.f2lPractice.moves}>{moves.map((move, index) => <code key={`${String(index)}${move}`}>{move}</code>)}</div>
        <div className="control-row">
          <button type="button" className="btn" disabled={solved || moves.length === 0} onClick={undo}><ArrowUUpLeftIcon size={16} aria-hidden />{cfop.f2lPractice.undo}</button>
          <button type="button" className="btn" disabled={moves.length === 0} onClick={reset}><ArrowCounterClockwiseIcon size={16} aria-hidden />{cfop.f2lPractice.reset}</button>
          <button type="button" className="btn" disabled={solved || hintCount >= hints.length} onClick={() => { setHintCount((n) => n + 1); }}><LightbulbIcon size={16} aria-hidden />{hintCount === 0 ? cfop.exercise.hint : cfop.exercise.hintN(hintCount + 1)}</button>
          <button type="button" className="btn" disabled={solved || showSolution} onClick={giveUp}>{cfop.f2lPractice.solution}</button>
        </div>
        {shownHints.length > 0 ? <ol className="feedback" data-tone="hint" aria-label={cfop.f2lPractice.hint}>{shownHints.map((text, index) => <li key={text}><strong>{cfop.exercise.hintN(index + 1)}.</strong> {text}</li>)}</ol> : null}
        {remaining === 0 && !crossOk && !solved ? <p className="feedback" data-tone="wrong" role="alert">{cfop.f2lPractice.brokenCross}</p> : null}
        {solved ? (
          <div className="feedback" data-tone="right" data-fresh="true" role="status">
            <p>{cfop.exercise.solvedIn(moves.length, referenceMoves, idea ?? "")}</p>
            <p className="t-meta text-quiet">{cfop.f2lPractice.solvedWith(moves.length)}</p>
          </div>
        ) : null}
        {showSolution ? (
          <div className="flex flex-col gap-2">
            <p className="t-ui">{cfop.exercise.solutionIntro} <code className="t-notation">{reference}</code></p>
            <Cube setup={setup} alg={reference} controls label={cfop.f2lPractice.solution} {...(highlight === undefined || highlight.length === 0 ? {} : { highlight })} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
