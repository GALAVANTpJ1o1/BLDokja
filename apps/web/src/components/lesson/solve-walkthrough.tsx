"use client";

import { formatMoves, solveOpOp, stepMoves, type MethodSolution, type MethodStep } from "@bld/cube-engine";
import { useMemo, useState } from "react";
import { Cube } from "@/components/cube/cube";
import { LetterNotch } from "@/components/letters/letters";
import { algDatasets } from "@/content/algs";
import { en } from "@/i18n/en";
import { useReader, type Reader } from "@/lib/reader";
import { piecesOf } from "./op-demos";

export function opSolution(reader: Reader, scramble: string): MethodSolution | undefined {
  const { opCorners, opEdges, opParity } = algDatasets();
  const solved = solveOpOp(reader.puzzle, { alg: scramble }, { scheme: reader.scheme, corners: opCorners, edges: opEdges, parity: opParity });
  return solved.ok ? solved.value : undefined;
}

function stepTitle(reader: Reader, solution: MethodSolution, step: MethodStep): string {
  if (step.kind === "target") {
    const trace = solution.traces[step.pieceType];
    const letter = trace.targets[step.traceIndex] ?? reader.letterOf(step.target) ?? "?";
    return en.lesson.walkTarget(en.lesson.pieces[step.pieceType], letter, step.target);
  }
  if (step.kind === "parity") return en.lesson.walkParity;
  return en.lesson.walkOther;
}

function litFor(reader: Reader, step: MethodStep): string[] {
  const { opCorners, opEdges } = algDatasets();
  if (step.kind === "target") {
    const dataset = step.pieceType === "corners" ? opCorners : opEdges;
    return piecesOf(reader, [dataset.buffer, step.target]);
  }
  if (step.kind === "parity") return piecesOf(reader, [...step.cancels.corners, ...step.cancels.edges, opCorners.buffer, opEdges.buffer]);
  return [];
}

/**
 * A whole Old Pochmann solve, step by step (BRIEF §6 lesson 15), from the engine's solver and the
 * verified datasets: the memo first, then each target's setup, swap and undo in order, the parity alg
 * when the counts are odd, and every step animated from where the last one left the cube.
 */
export function SolveWalkthrough({ scramble }: { scramble: string }) {
  const reader = useReader();
  const solution = useMemo(() => (reader === undefined ? undefined : opSolution(reader, scramble)), [reader, scramble]);
  const [index, setIndex] = useState(-1);
  if (reader === undefined || solution === undefined) return <p className="t-meta text-quiet">{en.cube.loading}</p>;

  const steps = solution.steps.filter((s) => s.kind !== "frame");
  const step = index >= 0 ? steps[index] : undefined;
  const before = steps.slice(0, Math.max(0, index)).flatMap((s) => [...stepMoves(s)]);
  const setup = `${scramble} ${formatMoves(before)}`.trim();
  const memo = (type: "corners" | "edges") => (
    <p className="flex flex-wrap items-baseline gap-x-1 gap-y-2">
      <span className="mr-2 t-meta text-quiet">{en.lesson.pieces[type]}</span>
      {solution.traces[type].targets.map((letter, i) => (
        <span key={`${type}-${i}`} className={i % 2 === 1 ? "mr-3" : ""}>
          <LetterNotch letter={letter} face={reader.faceOf(solution.traces[type].targetStickers[i] ?? "U")} />
        </span>
      ))}
    </p>
  );

  return (
    <div className="my-6 flex flex-col gap-4">
      <p className="t-meta text-quiet">
        {en.lesson.scramble}: <span className="t-notation">{scramble}</span>
      </p>
      <div className="panel flex flex-col gap-2 p-4">
        <span className="t-subheading">{en.lesson.memo}</span>
        {memo("edges")}
        {memo("corners")}
        <p className="t-meta">{solution.traces.edges.parity ? en.lesson.parityYes : en.lesson.parityNo}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Cube key={index} setup={index < 0 ? scramble : setup} alg={step === undefined ? "" : formatMoves(stepMoves(step))} highlight={step === undefined ? undefined : litFor(reader, step)} controls={step !== undefined} autoplay={step !== undefined} label={step === undefined ? en.lesson.scrambledCube : stepTitle(reader, solution, step)} />
        <div className="flex flex-col gap-3 self-center">
          <p className="t-subheading" aria-live="polite">
            {step === undefined ? en.lesson.walkStart(steps.length) : `${index + 1} / ${steps.length} · ${stepTitle(reader, solution, step)}`}
          </p>
          {step?.kind === "target" ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="t-meta text-quiet">{en.lesson.setup}</dt>
              <dd className="t-notation">{step.setup.length === 0 ? en.lesson.noSetup : formatMoves(step.setup)}</dd>
              <dt className="t-meta text-quiet">{en.lesson.swap}</dt>
              <dd className="t-notation">{formatMoves(step.core)}</dd>
              <dt className="t-meta text-quiet">{en.lesson.undo}</dt>
              <dd className="t-notation">{step.undo.length === 0 ? en.lesson.noSetup : formatMoves(step.undo)}</dd>
            </dl>
          ) : step?.kind === "parity" ? (
            <p className="t-notation">{formatMoves(step.alg)}</p>
          ) : null}
          <div className="flex gap-2">
            <button type="button" className="btn" disabled={index < 0} onClick={() => { setIndex((i) => i - 1); }}>{en.lesson.previous}</button>
            <button type="button" className="btn btn-strong" disabled={index >= steps.length - 1} onClick={() => { setIndex((i) => i + 1); }}>{index < 0 ? en.lesson.startSolve : en.lesson.next}</button>
          </div>
          {index === steps.length - 1 ? <p className="t-body">{en.lesson.walkDone}</p> : null}
        </div>
      </div>
    </div>
  );
}
