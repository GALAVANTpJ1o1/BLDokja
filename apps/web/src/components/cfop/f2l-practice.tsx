"use client";

import { createRng, generateF2LPractice, type F2LLevel, type F2LPractice as Practice } from "@bld/cube-engine";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { usePuzzle } from "@/components/cube/use-puzzle";
import { TransitionLink } from "@/components/transitions/transition-link";
import { cfopData } from "@/content/cfop";
import { cfop } from "@/i18n/cfop";
import { F2L_TRAINER } from "@/lib/cfop-stats";
import { f2lClue } from "@/lib/cfop-text";
import { newId, nowIso } from "@/lib/ids";
import { F2LBoard, type BoardResult } from "./f2l-board";
import { useCaseProgress } from "./use-cfop";

/**
 * F2L practice (polish brief §21-25): four levels from one unsolved pair to the whole first two layers, every state built
 * from a legal move sequence, success judged from the cube. Attempts are logged as ordinary `drill.attempt` events, so the
 * statistics below (and Progress) are folded from the same log as everything else.
 */
const LEVELS: readonly F2LLevel[] = [1, 2, 3, 4];
const caseId = (level: F2LLevel, index: number | undefined) => (level === 1 && index !== undefined ? `f2l_${String(index).padStart(2, "0")}` : `f2l_l${String(level)}`);

export function F2LPracticePage() {
  const params = useSearchParams();
  const puzzle = usePuzzle("3x3x3");
  const progress = useCaseProgress(F2L_TRAINER);
  const [level, setLevel] = useState<F2LLevel>(1);
  const [only, setOnly] = useState<readonly number[] | undefined>(() => {
    const wanted = Number(params.get("case"));
    return Number.isInteger(wanted) && wanted >= 1 && wanted <= 41 ? [wanted] : undefined;
  });
  const [counter, setCounter] = useState(0);
  const [seed] = useState(newId);
  const solutions = useMemo(() => cfopData().f2l.cases.map((c) => ({ index: c.number, alg: c.algs["2H"].alg })), []);

  const practice = useMemo<Practice | undefined>(() => {
    if (puzzle === undefined) return undefined;
    try {
      return generateF2LPractice(puzzle, createRng(`${seed}:${String(level)}:${String(counter)}`), level, solutions, level === 1 ? only : undefined);
    } catch (problem) {
      console.error("f2l practice: could not build a state", problem);
      return undefined;
    }
  }, [puzzle, seed, level, counter, solutions, only]);
  const error = puzzle !== undefined && practice === undefined;

  const log = useCallback((result: BoardResult, correct: boolean) => {
    if (practice === undefined) return;
    void progress.events.append([{
      id: newId(), type: "drill.attempt", at: nowIso(), trainer: F2L_TRAINER, caseId: caseId(practice.level, practice.caseIndex), strategy: "f2l-levels", correct, responseMs: result.elapsedMs,
      detail: { level: practice.level, moves: result.moves.length, hints: result.hints, resets: result.resets, reference: practice.reference.split(/\s+/).filter(Boolean).length, gaveUp: correct ? 0 : 1 },
    }]).catch(() => undefined);
  }, [practice, progress.events]);

  const kase = practice?.caseIndex === undefined ? undefined : cfopData().f2l.cases.find((c) => c.number === practice.caseIndex);
  const referenceMoves = practice === undefined ? 0 : practice.reference.split(/\s+/).filter(Boolean).length;
  const first = practice?.reference.split(/\s+/)[0] ?? "";
  const hints = useMemo(() => {
    if (practice === undefined) return [];
    if (kase !== undefined) return [cfop.exercises.hint1(f2lClue(kase)), cfop.exercises.hint2[kase.family] ?? "", cfop.exercises.hint3(first)];
    return [cfop.f2lPractice.multiHint1, cfop.f2lPractice.multiHint2, cfop.exercises.hint3(first)];
  }, [practice, kase, first]);

  const stats = useMemo(() => {
    const rows = [...progress.stats.values()];
    const solves = rows.reduce((n, r) => n + r.correct, 0);
    const level1 = rows.filter((r) => /^f2l_\d\d$/.test(r.caseId));
    const moves = level1.reduce((n, r) => n + r.moves, 0); const level1Solves = level1.reduce((n, r) => n + r.correct, 0);
    return {
      solves, averageMoves: level1Solves === 0 ? undefined : moves / level1Solves,
      hints: rows.reduce((n, r) => n + r.hints, 0), resets: rows.reduce((n, r) => n + r.resets, 0), cases: level1.length,
      weak: level1.filter((r) => r.attempts >= 2 && r.accuracy < 0.8).map((r) => r.caseId), perCase: level1.sort((a, b) => a.caseId.localeCompare(b.caseId)),
    };
  }, [progress.stats]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-label={cfop.f2lPractice.level}>
        <div className="step-strip" role="group" aria-label={cfop.f2lPractice.level} data-guide="f2l-levels">
          {LEVELS.map((value) => (
            <button key={value} type="button" className="btn" aria-pressed={level === value} onClick={() => { setLevel(value); setCounter(0); }}>
              {cfop.f2lPractice.level} {value} · {cfop.f2lPractice.levels[value]}
            </button>
          ))}
        </div>
        <p className="t-body text-quiet prose-measure">{cfop.f2lPractice.levelBlurb[level]}</p>
        <p className="t-meta text-quiet prose-measure">{cfop.f2lPractice.allowed}</p>
        {only !== undefined && level === 1 ? <p className="t-meta"><button type="button" className="text-link" onClick={() => { setOnly(undefined); setCounter((c) => c + 1); }}>{cfop.f2lPractice.allCases}</button></p> : null}
      </section>
      {practice === undefined ? <p className="t-body status-line" role={error ? "alert" : "status"}>{error ? cfop.f2lPractice.error : cfop.exercise.loading}</p> : (
        <section className="flex flex-col gap-4" aria-label={cfop.f2lPractice.title}>
          {kase !== undefined ? <p className="t-ui" role="status">{cfop.f2lPractice.whichCase(kase.number)} <span className="text-quiet">{f2lClue(kase)}</span></p> : null}
          <F2LBoard
            key={`${String(level)}:${String(counter)}`}
            setup={practice.setup} reference={practice.reference} referenceMoves={referenceMoves} label={cfop.f2lPractice.title}
            mode={level === 1 ? "F2L_SINGLE_PAIR" : "F2L_MULTI_PAIR"} hints={hints}
            idea={level === 1 ? cfop.f2lPractice.idea : cfop.f2lPractice.multiIdea}
            onSolved={(result) => { log(result, true); }} onGaveUp={(result) => { log(result, false); }}
          />
          <div className="control-row">
            <button type="button" className="btn btn-strong" onClick={() => { setCounter((c) => c + 1); }}>{cfop.f2lPractice.next}</button>
            {kase !== undefined ? <TransitionLink className="btn" href="/reference/f2l/">{cfop.sheet.cheats}</TransitionLink> : null}
          </div>
        </section>
      )}
      <section className="flex flex-col gap-3" aria-labelledby="f2l-stats" data-guide="f2l-stats">
        <h2 id="f2l-stats" className="t-heading">{cfop.f2lPractice.stats.title}</h2>
        {!progress.ready ? <p className="t-meta text-quiet" role="status">{cfop.exercise.loading}</p> : stats.solves === 0 && stats.perCase.length === 0 ? <p className="t-body text-quiet">{cfop.f2lPractice.stats.none}</p> : (
          <>
            <dl className="grid gap-3 sm:grid-cols-5 t-body">
              <div><dt className="t-meta text-quiet">{cfop.f2lPractice.stats.solves}</dt><dd className="t-subheading">{stats.solves}</dd></div>
              <div><dt className="t-meta text-quiet">{cfop.f2lPractice.stats.averageMoves}</dt><dd className="t-subheading">{stats.averageMoves === undefined ? "–" : stats.averageMoves.toFixed(1)}</dd></div>
              <div><dt className="t-meta text-quiet">{cfop.f2lPractice.stats.hints}</dt><dd className="t-subheading">{stats.hints}</dd></div>
              <div><dt className="t-meta text-quiet">{cfop.f2lPractice.stats.resets}</dt><dd className="t-subheading">{stats.resets}</dd></div>
              <div><dt className="t-meta text-quiet">{cfop.f2lPractice.stats.cases}</dt><dd className="t-subheading">{stats.cases} / 41</dd></div>
            </dl>
            {stats.weak.length > 0 ? <p className="t-body"><strong>{cfop.f2lPractice.stats.weak}:</strong> {stats.weak.map((id) => cfop.f2lName(Number(id.slice(4)))).join(", ")}</p> : null}
            {stats.perCase.length > 0 ? (
              <details className="quiet-disclosure">
                <summary>{cfop.f2lPractice.stats.perCase}</summary>
                <div className="data-table-wrap"><table className="data-table stat-table"><thead><tr><th scope="col">{cfop.f2lPractice.stats.perCase}</th><th scope="col">{cfop.f2lPractice.stats.success}</th><th scope="col">{cfop.f2lPractice.stats.averageMoves}</th></tr></thead>
                  <tbody>{stats.perCase.map((row) => <tr key={row.caseId}><th scope="row">{cfop.f2lName(Number(row.caseId.slice(4)))}</th><td>{`${String(row.correct)} / ${String(row.attempts)}`}</td><td>{row.correct === 0 ? "–" : (row.moves / row.correct).toFixed(1)}</td></tr>)}</tbody></table></div>
              </details>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
