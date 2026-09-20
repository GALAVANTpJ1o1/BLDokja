"use client";

import type { AppEvent, Difficulty } from "@bld/storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cube } from "@/components/cube/cube";
import { LetterNotch } from "@/components/letters/letters";
import { piecesOf } from "@/lib/cube-highlights";
import { en } from "@/i18n/en";
import { polish } from "@/i18n/polish";
import { ScrambleControls, useScramble } from "@/lib/use-scramble";
import { shortcutIgnored } from "@/lib/keyboard";
import type { Reader } from "@/lib/reader";
import { newId, nowIso } from "@/lib/storage-client";
import { constrainedScramble, traceConstraints, type ConstrainedScramble } from "@/trainers/difficulty";
import { scrambleDrill, type MethodDatasets, type ScrambleDrill, type ScrambleMethod } from "@/trainers/m2op-cases";

interface RunProps {
  readonly reader: Reader;
  readonly drill: ScrambleDrill;
  readonly sighted: boolean;
  readonly onGraded: (step: number, correct: boolean, responseMs: number) => void;
  readonly onNext: () => void;
}

/** One scramble, one step at a time: recall the setup (or parity alg), reveal it on the cube, mark yourself. */
function ScrambleRun({ reader, drill, sighted, onGraded, onNext }: RunProps) {
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<readonly boolean[]>([]);
  const [replay, setReplay] = useState(0);
  const shownAt = useRef(0);
  const revealMs = useRef(0);
  const item = drill.items[step];
  const done = item === undefined;

  useEffect(() => {
    shownAt.current = performance.now();
  }, [step]);

  const reveal = useCallback(() => {
    if (done || revealed) return;
    revealMs.current = performance.now() - shownAt.current;
    setRevealed(true);
  }, [done, revealed]);

  const grade = useCallback(
    (correct: boolean) => {
      if (done || !revealed) return;
      onGraded(step, correct, revealMs.current);
      setResults((r) => [...r, correct]);
      setRevealed(false);
      setStep((s) => s + 1);
    },
    [done, revealed, onGraded, step],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcutIgnored(event)) return;
      if (done) {
        if (event.key === "Enter" || event.key === "n" || event.key === "N") onNext();
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        reveal();
      } else if (event.key === "j" || event.key === "J" || event.key === "ArrowRight") grade(true);
      else if (event.key === "f" || event.key === "F" || event.key === "ArrowLeft") grade(false);
      else if (event.key === "r" || event.key === "R") setReplay((n) => n + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [done, reveal, grade, onNext]);

  const memoLine = (pieceType: "edges" | "corners") => {
    const letters = drill.memo[pieceType];
    const stickers = drill.items.filter((it) => it.pieceType === pieceType);
    return (
      <p className="flex flex-wrap items-baseline gap-x-1 gap-y-2">
        <span className="mr-2 t-meta text-quiet">{en.lesson.pieces[pieceType]}</span>
        {letters.map((letter, i) => {
          const at = stickers[i];
          const live = item?.pieceType === pieceType && item.number === i + 1;
          return (
            <span key={`${pieceType}-${String(i)}`} className={`${i % 2 === 1 ? "mr-3" : ""} ${live ? "font-[700] underline underline-offset-4" : ""}`}>
              <LetterNotch letter={letter} face={reader.faceOf(at?.target ?? "U")} />
            </span>
          );
        })}
      </p>
    );
  };

  const total = drill.items.length;
  const right = results.filter(Boolean).length;
  const setupState = `${drill.scramble} ${item?.before ?? drill.moves}`.trim();
  const title =
    item === undefined
      ? en.m2op.scrambleDone(right, total)
      : item.kind === "parity"
        ? en.m2op.parityStep
        : en.m2op.scrambleTarget(en.lesson.pieces[item.pieceType ?? "edges"], item.number ?? 0, item.letter ?? "?", item.target ?? "");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="t-meta text-quiet">
          {en.trace.scramble}: <span className="t-notation">{drill.scramble}</span>
        </p>
        {memoLine("edges")}
        {memoLine("corners")}
      </div>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {item !== undefined && revealed ? (
          <Cube key={`${String(step)}-${String(replay)}`} setup={setupState} alg={item.moves} highlight={piecesOf(reader, item.lit)} controls autoplay={!sighted} tempo={sighted ? 0.5 : 1} label={title} />
        ) : (
          <Cube key={`still-${String(step)}`} setup={setupState} {...(item === undefined ? {} : { highlight: piecesOf(reader, item.lit) })} label={title} />
        )}
        <div className="flex flex-col gap-4 self-center">
          <p className="t-meta">{en.m2op.stepOf(Math.min(step + 1, total), total)}</p>
          <p className="t-subheading">{title}</p>
          {item?.position !== undefined ? <p className="t-meta">{item.position === "odd" ? en.m2op.oddPosition : en.m2op.evenPosition}</p> : null}
          {item === undefined ? (
            <div>
              <button type="button" className="btn btn-strong" onClick={onNext} aria-keyshortcuts="N">{en.m2op.nextScramble}</button>
            </div>
          ) : !revealed ? (
            <>
              <p className="t-body">{item.kind === "parity" ? en.m2op.parityRecall : en.m2op.recall}</p>
              <div>
                <button type="button" className="btn btn-strong" onClick={reveal} aria-keyshortcuts="Space">{en.m2op.reveal}</button>
              </div>
            </>
          ) : (
            <>
              {item.shotAs !== undefined ? <p className="t-body font-[600]">{en.m2op.shootAs(item.shotAs)}</p> : null}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {item.setup !== "" ? (
                  <>
                    <dt className="t-meta text-quiet">{en.m2op.setup}</dt>
                    <dd className="t-notation">{item.setup}</dd>
                    <dt className="t-meta text-quiet">{en.m2op.swap}</dt>
                    <dd className="t-notation">{item.core}</dd>
                    <dt className="t-meta text-quiet">{en.m2op.undo}</dt>
                    <dd className="t-notation">{item.undo}</dd>
                  </>
                ) : (
                  <>
                    <dt className="t-meta text-quiet">{en.m2op.alg}</dt>
                    <dd className="t-notation">{item.core}</dd>
                  </>
                )}
              </dl>
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => { grade(false); }} aria-keyshortcuts="F">{en.m2op.wrong}</button>
                <button type="button" className="btn btn-strong" onClick={() => { grade(true); }} aria-keyshortcuts="J">{en.m2op.right}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Drill by full scramble (BRIEF §7.2): a seeded scramble solved with OP/OP or M2/OP by the engine's
 * solver, walked step by step from the state the previous step left. Each step is logged under the same
 * case id as the per-target drills, so it feeds the same schedules and mastery.
 */
export function ScrambleDrillView({ reader, datasets, method, sighted, seed, difficulty, append }: { reader: Reader; datasets: MethodDatasets; method: ScrambleMethod; sighted: boolean; seed: string; difficulty: Difficulty | undefined; append: (events: readonly AppEvent[]) => Promise<void> }) {
  const [index, setIndex] = useState(0);
  // Scramble limits from the difficulty settings go through the engine's constrained generation.
  const constraints = useMemo(() => traceConstraints(difficulty), [difficulty]);
  const buffers = method === "op" ? reader.buffers.op : reader.buffers.m2;
  const key = JSON.stringify([seed, method, index, constraints, buffers, reader.scheme.id]);
  const [constrained, setConstrained] = useState<{ key: string; result: ConstrainedScramble } | undefined>(undefined);
  useEffect(() => {
    if (constraints === undefined) return;
    let cancelled = false;
    void constrainedScramble(reader.puzzle, reader.scheme, buffers, constraints, `${seed}:${method}`, index).then((result) => {
      if (!cancelled) setConstrained({ key, result });
    });
    return () => {
      cancelled = true;
    };
  }, [reader, buffers, constraints, seed, method, index, key]);
  const random = useScramble(reader.puzzle, `${seed}:${method}`, index, constraints === undefined);
  const scramble = constraints === undefined ? random.scramble : constrained?.key === key && constrained.result.ok ? constrained.result.scramble : undefined;
  const noMatch = constraints !== undefined && constrained?.key === key && !constrained.result.ok;
  const drill = useMemo(() => (scramble === undefined ? undefined : scrambleDrill(reader.puzzle, reader.scheme, method, scramble, datasets)), [reader, datasets, method, scramble]);

  const onGraded = useCallback(
    (step: number, correct: boolean, responseMs: number) => {
      const item = drill?.items[step];
      if (item === undefined) return;
      void append([{ id: newId(), type: "drill.attempt", at: nowIso(), trainer: "m2op", caseId: item.caseId, strategy: "scramble", seed: `${seed}:${method}`, correct, responseMs: Math.round(responseMs), detail: { mode: "scramble", method, scrambleIndex: index, step, sighted } }]);
    },
    [drill, append, seed, method, index, sighted],
  );

  if (noMatch) return <p className="t-body" role="alert">{en.difficulty.noMatch}</p>;
  return <div className="flex flex-col gap-4">
    {constraints === undefined ? <ScrambleControls state={random} puzzle={reader.puzzle} /> : null}
    {drill === undefined ? <p role="status" className="t-meta text-quiet">{constraints === undefined ? polish.scramble.loading : en.difficulty.finding}</p> : <ScrambleRun key={`${method}-${String(index)}-${scramble}`} reader={reader} drill={drill} sighted={sighted} onGraded={onGraded} onNext={() => { setIndex((i) => i + 1); }} />}
  </div>;
}
