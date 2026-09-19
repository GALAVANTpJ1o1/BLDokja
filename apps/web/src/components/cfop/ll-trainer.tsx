"use client";

import {
  createRng, firstStage, generateChain, gradeStage, LL_MODES, matchAnswer, normaliseAnswer, orientationFeatures, permutationFeatures, summarise, topView,
  type CuratedCase, type CuratedStage, type LlChain, type LlMode, type LlSets, type StageRecord, type TrainerStage,
} from "@bld/cube-engine";
import type { KPattern } from "cubing/kpuzzle";
import { CheckIcon, LightbulbIcon } from "@phosphor-icons/react";
import { useSearchParams } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { usePuzzle } from "@/components/cube/use-puzzle";
import { TransitionLink } from "@/components/transitions/transition-link";
import { cfopData } from "@/content/cfop";
import { cfop } from "@/i18n/cfop";
import { en } from "@/i18n/en";
import { caseWeight, filterCases, LL_TRAINER, type PracticeFilter } from "@/lib/cfop-stats";
import { useCubeProfile } from "@/components/cube/profile-scope";
import { caseTitle, clueFor, colourLetters, shownAlg } from "@/lib/cfop-text";
import { NO_FEATURES } from "@/lib/cfop-views";
import { newId, nowIso } from "@/lib/ids";
import { RecognitionDiagram } from "./diagrams";
import { useCaseProgress, useExecutionStyle } from "./use-cfop";

const StageCube = lazy(() => import("./ll-cube").then((m) => ({ default: m.StageCube })));

/**
 * Last-layer recognition (polish brief §43-50, §86-87). One reusable trainer engine drives it (`firstStage`,
 * `nextStageGenerator`, `gradeStage`); this component only presents a stage and asks the engine what the answer means.
 *
 *   recognise (timed, quiet) → answer → feedback that teaches → the algorithm plays on the same cube → the state it leaves
 *
 * The clock runs from the case appearing to the answer being committed and stops there, so animation never counts (§48).
 */
const SIZES = [10, 20, 50] as const;
const FILTERS: readonly PracticeFilter[] = ["all", "learning", "weak", "slowest", "recentlyWrong", "neverSeen"];
const STAGE_SETS = ["eo", "co", "cp", "ep", "oll", "pll"] as const;
const SHEET_OF_MODE: Readonly<Record<LlMode, string>> = { "2look-oll": "2look-oll", "2look-pll": "2look-pll", "2look-ll": "2look-oll", "1look-oll": "oll", "1look-pll": "pll", "2look-oll+1look-pll": "2look-oll", "1look-oll+1look-pll": "oll" };

type Phase = "recognise" | "feedback" | "review";
interface Run {
  readonly mode: LlMode;
  readonly target: number;
  readonly done: number;
  readonly chain: LlChain;
  readonly applied: readonly string[];
  readonly stage: TrainerStage<KPattern>;
  readonly records: readonly StageRecord[];
}
interface Feedback { readonly ok: boolean; readonly text: string; readonly moves: string; readonly kase: CuratedCase | undefined; readonly stage: CuratedStage; readonly notes: readonly string[]; readonly fallback: boolean; readonly ms: number }

function modeOf(value: string | null): LlMode {
  return LL_MODES.find((m) => m === value) ?? "2look-oll";
}

export function LlTrainer() {
  const params = useSearchParams();
  const puzzle = usePuzzle("3x3x3");
  const profile = useCubeProfile();
  const progress = useCaseProgress(LL_TRAINER);
  const [style, setStyle] = useExecutionStyle();
  const sets = useMemo<LlSets>(() => cfopData().sets, []);
  const [mode, setMode] = useState<LlMode>(() => modeOf(params.get("mode")));
  // `?length=` lets a link or a test ask for a shorter session; the menu shows it alongside the usual choices.
  const [size, setSize] = useState<number>(() => {
    const asked = Number(params.get("length"));
    return Number.isInteger(asked) && asked >= 1 && asked <= 50 ? asked : 10;
  });
  const [filter, setFilter] = useState<PracticeFilter>("all");
  const [filterNote, setFilterNote] = useState(false);
  const [run, setRun] = useState<Run | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("recognise");
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<Feedback | undefined>(undefined);
  const [hints, setHints] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [error, setError] = useState(false);
  const [view3D, setView3D] = useState(false);
  const shownAt = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const seed = useRef(newId());
  const counter = useRef(0);

  const startChain = useCallback((base: Pick<Run, "mode" | "target" | "done" | "records">, usedFilter: PracticeFilter): Run | undefined => {
    if (puzzle === undefined) return undefined;
    try {
      const ids = STAGE_SETS.flatMap((s) => sets[s].cases.map((c) => c.id));
      const allowedIds = new Set(filterCases(ids, progress.stats, usedFilter, progress.manual));
      setFilterNote(usedFilter !== "all" && allowedIds.size === 0);
      const chain = generateChain(puzzle, sets, base.mode, createRng(`${seed.current}:${String(counter.current += 1)}`), style, {
        allowed: usedFilter === "all" || allowedIds.size === 0 ? () => true : (_stage, kase) => allowedIds.has(kase.id),
        weight: (_stage, kase) => caseWeight(progress.stats.get(kase.id)),
      });
      if (chain === undefined) throw new Error("could not build a chain");
      const stage = firstStage(puzzle, sets, base.mode, chain.start, style);
      if (stage === null) throw new Error("no first stage");
      return { ...base, chain, applied: [], stage };
    } catch (problem) {
      console.error("last-layer trainer: could not build a session", problem);
      setError(true);
      return undefined;
    }
  }, [puzzle, sets, progress.stats, progress.manual, style]);

  const begin = (chosenFilter: PracticeFilter = filter, chosenMode: LlMode = mode) => {
    setError(false); setFeedback(undefined); setTyped(""); setHints(0); setElapsed(0); setPhase("recognise"); setView3D(false);
    const next = startChain({ mode: chosenMode, target: size, done: 0, records: [] }, chosenFilter);
    if (next !== undefined) { setMode(chosenMode); setFilter(chosenFilter); setRun(next); }
  };

  // The clock starts when a stage is on screen and stops when the answer is committed.
  const timing = run !== undefined && phase === "recognise" && run.stage.metadata?.autoAdvance !== true;
  const stageKey = run === undefined ? "" : `${run.stage.id}:${String(run.done)}`;
  useEffect(() => {
    if (!timing) return;
    shownAt.current = performance.now();
    const timer = window.setInterval(() => { setElapsed(performance.now() - shownAt.current); }, 100);
    input.current?.focus();
    return () => { window.clearInterval(timer); };
  }, [timing, stageKey]);

  const state = run === undefined ? undefined : run.stage.state;
  const view = useMemo(() => (puzzle === undefined || state === undefined ? undefined : topView(puzzle, state)), [puzzle, state]);
  const stageName = run === undefined ? "" : (run.stage.metadata?.stage as CuratedStage | undefined) ?? "oll";
  const stageSet = run === undefined ? undefined : sets[stageName as CuratedStage];
  const meta = run?.stage.metadata;
  const isAuf = meta?.autoAdvance === true;
  const movesOf = (): string => (typeof meta?.moves === "string" ? meta.moves : "");
  // A stage that only needs a turn to line up is shown as its feedback straight away: there is nothing to recognise.
  const shownPhase: Phase = isAuf && phase === "recognise" ? "feedback" : phase;
  const features = useMemo(() => (view === undefined ? NO_FEATURES : { ...orientationFeatures(view), ...permutationFeatures(view) }), [view]);

  const suggestions = useMemo(() => {
    if (stageSet === undefined || typed.trim() === "") return [];
    const q = typed.toLowerCase().replace(/[^a-z0-9]/g, "");
    return stageSet.cases.filter((c) => [c.name, ...c.aliases, caseTitle(stageSet.stage, c)].some((s) => s.toLowerCase().replace(/[^a-z0-9]/g, "").includes(q))).slice(0, 8);
  }, [stageSet, typed]);

  const record = useCallback((entry: StageRecord, extra: Record<string, string | number>) => {
    void progress.events.append([{ id: newId(), type: "drill.attempt", at: nowIso(), trainer: LL_TRAINER, caseId: entry.caseId, strategy: run?.mode ?? "", correct: entry.correct, responseMs: entry.recognitionMs, detail: { stage: entry.stage, mode: run?.mode ?? "", style, hints: entry.hints, answer: entry.answer, ...extra } }]).catch(() => undefined);
  }, [progress.events, run?.mode, style]);

  const commit = (response: { kind: "name"; text: string } | { kind: "select"; ids: readonly string[] }, committedAt: number) => {
    if (run === undefined || stageSet === undefined || phase !== "recognise" || meta === undefined) return;
    if (response.kind === "name" && response.text.trim() === "") return;
    // The title a card shows ("OLL 27 — Sune") is a fine answer too: it is what the suggestions and the hints say.
    const asTitle = response.kind === "name" ? stageSet.cases.find((c) => normaliseAnswer(caseTitle(stageSet.stage, c)) === normaliseAnswer(response.text)) : undefined;
    const graded = asTitle === undefined ? response : ({ kind: "select", ids: [asTitle.id] } as const);
    const grade = gradeStage(run.stage, graded, shownAt.current, committedAt);
    const expected = run.stage.expected.kind === "case" ? run.stage.expected : undefined;
    const kase = stageSet.cases.find((c) => c.id === expected?.caseId);
    if (kase === undefined) return;
    const chosen = graded.kind === "select" ? stageSet.cases.find((c) => c.id === graded.ids[0]) : matchAnswer(stageSet, graded.text)[0];
    const answerText = graded.kind === "select" ? (chosen === undefined ? "" : caseTitle(stageSet.stage, chosen)) : graded.text.trim();
    const clue = clueFor(stageSet.stage, kase, features);
    const title = caseTitle(stageSet.stage, kase);
    const alg = shownAlg(kase, style);
    const notes = [alg.preAuf !== "" ? cfop.card.aufBefore(alg.preAuf) : "", alg.postAuf !== "" ? cfop.card.aufAfter(alg.postAuf) : ""].filter((n) => n !== "");
    const text = grade.correct ? cfop.trainer.correct(title, clue) : chosen === undefined ? cfop.trainer.wrongUnknown(answerText, title, clue) : cfop.trainer.wrong(caseTitle(stageSet.stage, chosen), title, clue);
    setElapsed(grade.elapsedMs);
    setAnnounce(cfop.trainer.live.timerStopped(cfop.trainer.seconds(grade.elapsedMs)));
    setFeedback({ ok: grade.correct, text, moves: movesOf(), kase, stage: stageSet.stage, notes, fallback: alg.fallback, ms: grade.elapsedMs });
    const entry: StageRecord = { stageId: run.stage.id, caseId: kase.id, stage: stageSet.stage, correct: grade.correct, recognitionMs: Math.round(grade.elapsedMs), answer: chosen?.id ?? answerText, hints };
    record(entry, { answerCaseId: chosen?.id ?? "" });
    setRun({ ...run, records: [...run.records, entry] });
    setPhase("feedback");
  };

  const submit = (event: SyntheticEvent) => { event.preventDefault(); commit({ kind: "name", text: typed }, event.timeStamp); };

  /** Apply the executed algorithm to this cube and move on: the next stage is played on the state it left. */
  const proceed = () => {
    if (run === undefined || puzzle === undefined) return;
    const moves = movesOf();
    const after = moves === "" ? run.stage.state : run.stage.state.applyAlg(moves);
    let next: TrainerStage<KPattern> | null;
    try { next = run.stage.nextStageGenerator?.(after) ?? null; } catch (problem) { console.error("last-layer trainer: the next stage could not be built", problem); setError(true); return; }
    setFeedback(undefined); setTyped(""); setHints(0); setElapsed(0); setView3D(false);
    if (next !== null) { setRun({ ...run, stage: next, applied: [...run.applied, moves] }); setPhase("recognise"); return; }
    const done = run.done + 1;
    if (done >= run.target) { setRun({ ...run, done, applied: [...run.applied, moves] }); setPhase("review"); return; }
    const chain = startChain({ mode: run.mode, target: run.target, done, records: run.records }, filter);
    if (chain !== undefined) { setRun(chain); setPhase("recognise"); }
  };

  const reveal = () => { setHints((n) => Math.min(3, n + 1)); };
  const hintTexts = useMemo(() => {
    if (run === undefined || stageSet === undefined || run.stage.expected.kind !== "case") return [];
    const kase = stageSet.cases.find((c) => c.id === (run.stage.expected.kind === "case" ? run.stage.expected.caseId : ""));
    if (kase === undefined) return [];
    return [cfop.trainer.hint1(cfop.trainer.stages[stageSet.stage] ?? ""), cfop.trainer.hint2(clueFor(stageSet.stage, kase, features)), cfop.trainer.hint3(caseTitle(stageSet.stage, kase))];
  }, [run, stageSet, features]);

  const summary = useMemo(() => (run === undefined ? undefined : summarise(run.records)), [run]);
  const titleOf = (id: string) => { for (const s of STAGE_SETS) { const c = sets[s].cases.find((k) => k.id === id); if (c !== undefined) return caseTitle(s, c); } return id; };
  const accumulated = run === undefined ? "" : [run.chain.setup, ...run.applied].filter((m) => m !== "").join(" ");
  const diagramLabel = run === undefined ? "" : cfop.card.diagram(cfop.trainer.stages[stageName] ?? "", stageName === "pll" || stageName === "cp" || stageName === "ep"
    ? [features.bars.length > 0 ? cfop.clue.bar(features.bars) : "", features.headlights.length > 0 ? cfop.clue.headlights(features.headlights) : ""].join(" ").trim() || cfop.clue.noBar
    : `${cfop.clue.edges(features.edgeSides.length, features.edgeSides)} ${cfop.clue.corners(features.cornerPlaces.length, features.cornerPlaces)}`);

  /* ---------------------------------------------------------------- setup screen */
  if (run === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3" aria-labelledby="ll-mode" data-guide="ll-modes">
          <h2 id="ll-mode" className="t-heading">{cfop.trainer.mode}</h2>
          <div className="mode-grid" role="group" aria-label={cfop.trainer.mode}>
            {LL_MODES.map((m) => <button key={m} type="button" className="btn" aria-pressed={mode === m} onClick={() => { setMode(m); }}><span>{cfop.trainer.modes[m]}</span><span className="t-meta">{cfop.trainer.modeBlurb[m]}</span></button>)}
          </div>
        </section>
        <div className="control-row" data-guide="ll-options">
          <label className="t-ui flex items-center gap-2">{cfop.trainer.filter}
            <select className="field" value={filter} onChange={(event) => { setFilter(event.target.value as PracticeFilter); }}>{FILTERS.map((f) => <option key={f} value={f}>{cfop.trainer.filters[f]}</option>)}</select>
          </label>
          <label className="t-ui flex items-center gap-2">{cfop.trainer.length}
            <select className="field" value={size} onChange={(event) => { setSize(Number(event.target.value)); }}>{[...new Set([size, ...SIZES])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <div className="control-row" role="group" aria-label={cfop.trainer.style}><span className="t-meta text-quiet">{cfop.trainer.style}</span>{(["2H", "OH"] as const).map((s) => <button key={s} type="button" className="btn" aria-pressed={style === s} onClick={() => { setStyle(s); }}>{cfop.style[s]}</button>)}</div>
        </div>
        {filterNote ? <p className="t-meta status-line" role="status">{cfop.trainer.filterEmpty}</p> : null}
        <div className="control-row">
          <button type="button" className="btn btn-strong" disabled={puzzle === undefined || !progress.ready} onClick={() => { begin(); }}>{cfop.trainer.start}</button>
          <TransitionLink className="btn" href={`/reference/${SHEET_OF_MODE[mode]}/`}>{cfop.sheet.cheats}</TransitionLink>
        </div>
        {error ? <p className="status-line" role="alert">{cfop.trainer.error}</p> : null}
        <RecognitionRecord progress={progress} sets={sets} titleOf={titleOf} />
      </div>
    );
  }

  /* ---------------------------------------------------------------- review */
  if (phase === "review" && summary !== undefined) {
    const pct = Math.round(summary.accuracy * 100);
    return (
      <div className="flex flex-col gap-6" data-guide="ll-review">
        <section className="feedback" data-tone="right" data-fresh="true" role="status">
          <h2 className="t-heading">{cfop.trainer.session.title}</h2>
          <p className="t-body">{cfop.trainer.session.cases(summary.attempts)} · {cfop.trainer.session.correct(summary.correct, summary.attempts)} · {cfop.trainer.session.accuracy(pct)} · {cfop.trainer.session.average(cfop.trainer.seconds(summary.averageMs))}</p>
        </section>
        <div className="grid gap-4 sm:grid-cols-3">
          <ReviewList title={cfop.trainer.session.weakest} ids={summary.weakest} titleOf={titleOf} />
          <ReviewList title={cfop.trainer.session.slowest} ids={summary.slowest} titleOf={titleOf} />
          <ReviewList title={cfop.trainer.session.confused} ids={summary.confusedWith.map((c) => `${titleOf(c.caseId)} → ${titleOf(c.answered)} (${String(c.times)})`)} titleOf={(x) => x} />
        </div>
        <div className="control-row">
          <button type="button" className="btn btn-strong" onClick={() => { begin("weak", run.mode); }}>{cfop.trainer.session.practiseWeak}</button>
          <button type="button" className="btn" onClick={() => { begin(filter, run.mode); }}>{cfop.trainer.again}</button>
          <button type="button" className="btn" onClick={() => { setRun(undefined); setPhase("recognise"); }}>{cfop.trainer.modeChange}</button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- a stage */
  const stageIndex = Number(meta?.index ?? 0) + 1; const stageTotal = Number(meta?.total ?? 1);
  return (
    <div className="flex flex-col gap-5" data-shortcuts="off" data-guide="trainer-stage">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="t-ui"><strong>{cfop.trainer.modes[run.mode]}</strong> · {cfop.trainer.stageOf(cfop.trainer.stages[stageName] ?? "", stageIndex, stageTotal)}</p>
        <p className="t-meta text-quiet">{run.done + 1} / {run.target}</p>
      </header>
      <div className="recognition-stage" data-phase={shownPhase}>
        {view === undefined ? null : (
          <div className="stage-diagram" data-guide="ll-diagram">
            {view3D ? <Suspense fallback={<p className="t-meta text-quiet">{en.cube.loading}</p>}><StageCube setup={accumulated} mode={run.stage.displayMode} label={diagramLabel} /></Suspense>
              : <RecognitionDiagram diagram={view} mode={run.stage.displayMode as "OLL_EDGE_RECOGNITION" | "OLL_FULL_RECOGNITION" | "PLL_RECOGNITION"} label={diagramLabel} letters={colourLetters(profile)} bars={features.bars} headlights={features.headlights} />}
          </div>
        )}
        <button type="button" className="btn" aria-pressed={view3D} onClick={() => { setView3D((v) => !v); }}>{view3D ? cfop.trainer.viewDiagram : cfop.trainer.view3d}</button>
        {shownPhase === "recognise" && !isAuf ? (
          <form className="flex flex-col gap-3 items-center w-full" onSubmit={submit} noValidate>
            <p className="timer-readout" aria-hidden>{cfop.trainer.seconds(elapsed)}</p>
            <label className="t-ui sr-only" htmlFor="ll-answer">{cfop.trainer.answer}</label>
            <div className="answer-form">
              <input id="ll-answer" ref={input} className="field mono" value={typed} onChange={(event) => { setTyped(event.target.value); }} placeholder={cfop.trainer.answerHint} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-describedby="ll-quiet" />
              <button type="submit" className="btn btn-strong"><CheckIcon size={16} aria-hidden />{cfop.trainer.submit}</button>
              <button type="button" className="btn" onClick={reveal} disabled={hints >= 3}><LightbulbIcon size={16} aria-hidden />{hints === 0 ? cfop.trainer.hintTitle : cfop.trainer.hintN(Math.min(3, hints + 1))}</button>
            </div>
            {suggestions.length > 0 ? <div className="suggest-list" role="group" aria-label={cfop.trainer.suggestions}>{suggestions.map((c) => <button key={c.id} type="button" className="btn" onClick={(event) => { commit({ kind: "select", ids: [c.id] }, event.timeStamp); }}>{stageSet === undefined ? c.name : caseTitle(stageSet.stage, c)}</button>)}</div> : null}
            <p id="ll-quiet" className="t-meta text-quiet">{cfop.trainer.quiet}</p>
            {hints > 0 ? <ol className="feedback" aria-label={cfop.trainer.hintTitle}>{hintTexts.slice(0, hints).map((text, i) => <li key={text}><strong>{cfop.trainer.hintN(i + 1)}.</strong> {text}</li>)}</ol> : null}
          </form>
        ) : null}
        {shownPhase === "feedback" ? (
          <div className="flex flex-col gap-4 w-full" aria-live="polite">
            {isAuf ? <p className="feedback" data-tone="right" role="status">{cfop.trainer.autoAuf} <code className="t-notation">{movesOf()}</code></p> : feedback === undefined ? null : (
              <div className="feedback" data-tone={feedback.ok ? "right" : "wrong"} data-fresh="true" role={feedback.ok ? "status" : "alert"}>
                <p>{feedback.text}</p>
                <p className="t-meta text-quiet">{cfop.trainer.timer}: {cfop.trainer.seconds(feedback.ms)}</p>
                <p><span className="case-card-key">{cfop.trainer.algorithm}</span> <code className="t-notation">{feedback.moves}</code></p>
                {feedback.notes.map((n) => <p key={n} className="t-meta text-quiet">{n}</p>)}
                {feedback.fallback ? <p className="t-meta text-quiet">{cfop.trainer.fallbackNote}</p> : null}
              </div>
            )}
            {isAuf || feedback === undefined ? null : (
              <Suspense fallback={null}><StageCube setup={accumulated} alg={feedback.moves} mode={run.stage.displayMode} label={cfop.trainer.executing} autoplay controls /></Suspense>
            )}
            <div className="control-row">
              <button type="button" className="btn btn-strong" onClick={proceed} autoFocus>{feedback?.ok === false ? cfop.trainer.continueAfterWrong : cfop.trainer.next}</button>
              <button type="button" className="btn" onClick={() => { setRun(undefined); }}>{cfop.trainer.stop}</button>
            </div>
          </div>
        ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {error ? <p className="status-line" role="alert">{cfop.trainer.error}</p> : null}
    </div>
  );
}

function ReviewList({ title, ids, titleOf }: { title: string; ids: readonly string[]; titleOf: (id: string) => string }) {
  return (
    <section className="flex flex-col gap-2"><h3 className="t-subheading">{title}</h3>
      {ids.length === 0 ? <p className="t-meta text-quiet">{cfop.trainer.session.none}</p> : <ul className="ml-5 list-disc t-body">{ids.map((id) => <li key={id}>{titleOf(id)}</li>)}</ul>}
    </section>
  );
}

/** The record under the setup screen: per case, from the event log (§50). */
function RecognitionRecord({ progress, sets, titleOf }: { progress: ReturnType<typeof useCaseProgress>; sets: LlSets; titleOf: (id: string) => string }) {
  const rows = STAGE_SETS.flatMap((stage) => sets[stage].cases.flatMap((kase) => { const s = progress.stats.get(kase.id); return s === undefined ? [] : [{ stage, kase, s }]; }));
  const trendText = { faster: cfop.trainer.stats.faster, slower: cfop.trainer.stats.slower, steady: cfop.trainer.stats.steady, unknown: "–" } as const;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="ll-record" data-guide="ll-record">
      <h2 id="ll-record" className="t-heading">{cfop.trainer.stats.title}</h2>
      {!progress.ready ? <p className="t-meta text-quiet" role="status">{cfop.exercise.loading}</p> : rows.length === 0 ? <p className="t-body text-quiet">{cfop.trainer.stats.none}</p> : (
        <div className="data-table-wrap">
          <table className="data-table stat-table">
            <thead><tr>{[cfop.trainer.stats.cases, cfop.trainer.stats.attempts, cfop.trainer.stats.accuracy, cfop.trainer.stats.average, cfop.trainer.stats.best, cfop.trainer.stats.recent, cfop.trainer.stats.trend, cfop.trainer.stats.wrongWith, cfop.trainer.stats.status].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {rows.sort((a, b) => a.s.accuracy - b.s.accuracy).map(({ kase, s }) => {
                const status = progress.statusOf(kase.id);
                return (
                  <tr key={kase.id}>
                    <th scope="row">{titleOf(kase.id)}</th><td>{s.attempts}</td><td>{Math.round(s.accuracy * 100)}%</td>
                    <td>{s.averageMs === undefined ? "–" : cfop.trainer.seconds(s.averageMs)}</td><td>{s.bestMs === undefined ? "–" : cfop.trainer.seconds(s.bestMs)}</td><td>{s.recentMs === undefined ? "–" : cfop.trainer.seconds(s.recentMs)}</td>
                    <td>{trendText[s.trend]}</td><td>{s.mostCommonWrong === undefined ? "–" : titleOf(s.mostCommonWrong)}</td><td>{cfop.status[status.value]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
