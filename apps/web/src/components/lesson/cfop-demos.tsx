"use client";

import type { CuratedStage } from "@bld/cube-engine/cfop-data";
import { useContext, useEffect, useRef, useState } from "react";
import { CaseCard } from "@/components/cfop/case-card";
import { CaseReference } from "@/components/cfop/case-reference";
import { F2LBoard } from "@/components/cfop/f2l-board";
import { useExecutionStyle } from "@/components/cfop/use-cfop";
import { TransitionLink } from "@/components/transitions/transition-link";
import { cfopData } from "@/content/cfop";
import { cfop } from "@/i18n/cfop";
import { newId, nowIso } from "@/lib/ids";
import { EXERCISES, exercise } from "@/lib/f2l-exercises";
import { loadStorage } from "@/lib/storage-lazy";
import { LessonMetaContext } from "./lesson-meta";

/**
 * Lesson components for the CFOP track (polish brief §14-20, §29-36, §84): the three guided F2L exercises, the case cards
 * for a stage, and the direct links from a lesson to its practice and its cheat sheet.
 */

/** The checkpoint `kind="f2l-exercises"`: three cube exercises. Solving all three passes it. */
export function F2LExerciseCheckpoint({ id }: { id: string }) {
  const meta = useContext(LessonMetaContext);
  const [solved, setSolved] = useState<ReadonlySet<number>>(new Set());
  const recorded = useRef(false);
  const title = meta?.checkpoints.find((c) => c.id === id)?.title ?? id;
  useEffect(() => {
    if (solved.size < EXERCISES.length || recorded.current) return;
    recorded.current = true;
    void loadStorage()
      .then((storage) => storage.appendEvents([{ id: newId(), type: "lesson.checkpointPassed", at: nowIso(), lessonId: meta?.lessonId ?? "unknown", checkpointId: id, score: { correct: EXERCISES.length, total: EXERCISES.length } }]))
      .then(() => { window.dispatchEvent(new CustomEvent("bld:progress")); });
  }, [solved, id, meta?.lessonId]);
  return (
    <section className="flex flex-col gap-6" aria-label={title} data-guide="lesson-checkpoint">
      <header className="flex flex-col gap-2">
        <h2 className="t-heading">{title}</h2>
        <p className="t-body text-quiet prose-measure">{cfop.exercises.intro}</p>
        <p className="t-meta text-quiet" role="status">{`${solved.size} / ${EXERCISES.length}`}</p>
      </header>
      {EXERCISES.map((n) => <ExerciseBlock key={n} n={n} done={solved.has(n)} onSolved={() => { setSolved((current) => new Set(current).add(n)); }} />)}
    </section>
  );
}

function ExerciseBlock({ n, done, onSolved }: { n: 1 | 2 | 3; done: boolean; onSolved: () => void }) {
  const data = exercise(n);
  return (
    <article className="flex flex-col gap-3" aria-labelledby={`exercise-${String(n)}`} data-done={done}>
      <h3 id={`exercise-${String(n)}`} className="t-subheading">{cfop.exercise.title(n)} · {cfop.exercises.titles[n]}</h3>
      <p className="t-body text-quiet">{cfop.exercises.goals[n]}</p>
      <F2LBoard setup={data.setup} reference={data.reference} referenceMoves={data.referenceMoves} label={cfop.exercises.titles[n]} hints={data.hints} idea={data.idea} onSolved={onSolved} />
    </article>
  );
}

const STAGES: readonly CuratedStage[] = ["eo", "co", "cp", "ep", "oll", "pll"];

/** The case cards of one stage, in place in a lesson: the same card the cheat sheet uses. */
export function CaseCards({ stage, numbers = "", names = "", style: forced = "" }: { stage: string; numbers?: string; names?: string; style?: string }) {
  const [chosen] = useExecutionStyle();
  const style = forced === "OH" ? "OH" : forced === "2H" ? "2H" : chosen;
  const wanted = STAGES.find((s) => s === stage);
  if (wanted === undefined) return null;
  const only = numbers.split(/\s+/).filter((n) => n !== "").map(Number);
  const onlyNames = names.split(/\s+/).filter((n) => n !== "").map((n) => n.toLowerCase());
  const cases = cfopData().sets[wanted].cases.filter((c) => (only.length === 0 || (c.number !== undefined && only.includes(c.number))) && (onlyNames.length === 0 || onlyNames.includes(c.name.toLowerCase())));
  return <div className="case-grid" data-guide="lesson-cards">{cases.map((kase) => <CaseCard key={kase.id} item={{ kind: "ll", stage: wanted, kase }} style={style} tempo={1} level={4} />)}</div>;
}

const PRACTICE: Readonly<Record<string, { readonly href: string; readonly label: string }>> = {
  f2l: { href: "/practice/f2l/", label: cfop.sheet.f2lPractice },
  "2look-oll": { href: "/practice/last-layer/?mode=2look-oll", label: cfop.sheet.practise },
  "2look-pll": { href: "/practice/last-layer/?mode=2look-pll", label: cfop.sheet.practise },
  oll: { href: "/practice/last-layer/?mode=1look-oll", label: cfop.sheet.practise },
  pll: { href: "/practice/last-layer/?mode=1look-pll", label: cfop.sheet.practise },
  "2look-ll": { href: "/practice/last-layer/?mode=2look-ll", label: cfop.sheet.practise },
};

/** Direct links out of a lesson: practise what it taught, and open its complete cheat sheet (§39, §84). */
export function PracticeLink({ practise = "", sheet = "" }: { practise?: string; sheet?: string }) {
  const practice = PRACTICE[practise];
  return (
    <nav className="control-row" aria-label={cfop.sheet.practise} data-guide="lesson-links">
      {practice === undefined ? null : <TransitionLink className="btn btn-strong" href={practice.href}>{practice.label}</TransitionLink>}
      {sheet === "" ? null : <TransitionLink className="btn" href={`/reference/${sheet}/`}>{cfop.sheet.cheats}</TransitionLink>}
    </nav>
  );
}

/** The complete 41-case F2L reference, in place in the advanced lesson: the same page the cheat sheet is (§28). */
export function F2LReference() {
  return <div className="not-prose"><CaseReference sheet="f2l" /></div>;
}
