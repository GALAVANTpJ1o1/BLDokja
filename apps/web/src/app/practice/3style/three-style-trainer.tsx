"use client";

import { createSelector, drillScramble, type Selector, type SelectionStrategy } from "@bld/cube-engine";
import { reviewsByCase, scheduleAll, statsFor } from "@bld/srs";
import type { AlgOverrides } from "@bld/storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cube } from "@/components/cube/cube";
import { piecesOf } from "@/components/lesson/op-demos";
import { useSettings } from "@/components/settings/settings-provider";
import { DifficultySummary } from "@/components/trainer/difficulty-summary";
import { SessionReport } from "@/components/trainer/session-report";
import { caseStatus } from "@/components/trainer/mastery";
import { useHardCutoff } from "@/components/trainer/use-time-limit";
import { Segmented, TrainerShell } from "@/components/trainer/trainer-shell";
import { algDatasets } from "@/content/algs";
import { en } from "@/i18n/en";
import { threeStyleForReader, useMethodData } from "@/lib/methods";
import { useReader } from "@/lib/reader";
import { announcement } from "@/lib/speech";
import { newId, nowIso } from "@/lib/storage-client";
import { readPreference, useEvents, writePreference } from "@/lib/use-events";
import { subsetOf, timeVerdict } from "@/trainers/difficulty";
import { checkUserAlg, commCases, gridStickers, importOverrides, overridesFile, THREE_STYLE_TRAINER, withoutUserAlg, withUserAlg, type CommCase } from "@/trainers/three-style";
import { CaseGrid } from "./case-grid";

type Pieces = "corners" | "edges";
type Mode = "learn" | "recall";
type Strategy = Extract<SelectionStrategy, "coverage" | "weakness" | "uniform" | "spaced">;
const PIECES: readonly Pieces[] = ["corners", "edges"];
const MODES: readonly Mode[] = ["learn", "recall"];
const STRATEGIES: readonly Strategy[] = ["coverage", "weakness", "uniform", "spaced"];
const isPieces = (v: unknown): v is Pieces => v === "corners" || v === "edges";
const isMode = (v: unknown): v is Mode => v === "learn" || v === "recall";
const isStrategy = (v: unknown): v is Strategy => typeof v === "string" && (STRATEGIES as readonly string[]).includes(v);

/**
 * The 3-style trainer (BRIEF §7.3). Cases come from the verified dataset for your buffer (a rotation
 * image of the committed set for any buffer other than UFR/UF), with your own algs first once the engine
 * has checked them. Learn mode shows the alg; recall mode asks you to state it, reveal, and mark yourself.
 * Only recall attempts are logged, and they feed the FSRS schedules the grid is coloured by.
 */
export function ThreeStyleTrainer() {
  const reader = useReader();
  const { stored, update } = useSettings();
  const { events, append } = useEvents();
  const [pieces, setPieces] = useState<Pieces>(() => readPreference("bld.3style.pieces", "corners", isPieces));
  const [mode, setMode] = useState<Mode>(() => readPreference("bld.3style.mode", "recall", isMode));
  const [strategy, setStrategy] = useState<Strategy>(() => readPreference("bld.3style.strategy", "coverage", isStrategy));
  const [sessionSeed] = useState(() => newId());
  const difficulty = stored?.difficulty;
  const seed = difficulty?.seed ?? sessionSeed;
  const [timedOut, setTimedOut] = useState(false);
  const [overTarget, setOverTarget] = useState(false);
  const [current, setCurrent] = useState<CommCase | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [replay, setReplay] = useState(0);
  const [nothingDue, setNothingDue] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);
  const selector = useRef<Selector | undefined>(undefined);
  const shownAt = useRef(0);
  const revealMs = useRef(0);

  const built = useMethodData(reader, threeStyleForReader);
  const dataset = built?.ok === true ? built.value[pieces] : undefined;
  const { cases, rejected } = useMemo(() => (reader === undefined || dataset === undefined ? { cases: [], rejected: [] } : commCases(reader.puzzle, dataset, reader.scheme, stored?.algOverrides)), [reader, dataset, stored?.algOverrides]);
  // The drill order runs over your case subset when one is set; the grid still shows every case.
  const drilled = useMemo(() => subsetOf(difficulty, pieces === "corners" ? "3style-corners" : "3style-edges", cases), [difficulty, pieces, cases]);
  const stickers = useMemo(() => (reader === undefined || dataset === undefined ? [] : gridStickers(reader.puzzle, dataset, reader.scheme)), [reader, dataset]);
  const { schedules, now } = useMemo(() => {
    const at = new Date();
    return { now: at, schedules: scheduleAll(cases.map((c) => c.id), reviewsByCase(events ?? [], THREE_STYLE_TRAINER), at) };
  }, [cases, events]);

  const show = useCallback((c: CommCase | undefined) => {
    setCurrent(c);
    setRevealed(false);
    setTimedOut(false);
    setOverTarget(false);
    setReplay(0);
    setMessage(undefined);
    setTyped("");
    shownAt.current = performance.now();
  }, []);

  const pick = useCallback(() => {
    if (selector.current === undefined) return;
    const next = selector.current.next({ stats: (id) => statsFor(schedules.get(id)), now: Date.now() });
    if (!next.ok) {
      setNothingDue(next.error.reason === "nothing-due");
      show(undefined);
      return;
    }
    setNothingDue(false);
    show(cases.find((c) => c.id === next.value));
  }, [cases, schedules, show]);

  const caseKey = drilled.cases.map((c) => c.id).join(",");
  useEffect(() => {
    if (drilled.cases.length === 0 || events === undefined) return;
    const created = createSelector({ strategy, cases: drilled.cases.map((c) => c.id), seed: `${seed}:${pieces}:${strategy}` });
    selector.current = created.ok ? created.value : undefined;
    pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new selector only when the case set or the order changes
  }, [caseKey, strategy, seed, pieces, events === undefined]);

  // Keep the case on screen in step with your algs (adding one rebuilds the case list).
  const shown = current === undefined ? undefined : (cases.find((c) => c.id === current.id) ?? current);

  const reveal = useCallback(() => {
    if (shown === undefined || revealed || mode === "learn") return;
    revealMs.current = performance.now() - shownAt.current;
    setOverTarget(timeVerdict(difficulty, revealMs.current) === "over-target");
    setRevealed(true);
  }, [shown, revealed, mode, difficulty]);

  const grade = useCallback(
    (correct: boolean) => {
      if (shown === undefined || mode !== "recall" || !revealed) return;
      const time = timedOut ? "timed-out" : timeVerdict(difficulty, revealMs.current);
      void append([{ id: newId(), type: "drill.attempt", at: nowIso(), trainer: THREE_STYLE_TRAINER, caseId: shown.id, strategy, seed, correct: correct && time !== "timed-out", responseMs: Math.round(revealMs.current), detail: { pieceType: shown.pieceType, buffer: shown.buffer, targets: `${shown.targets[0]}-${shown.targets[1]}`, alg: shown.algs[0]?.alg ?? "", time } }]);
      setSessionCount((n) => n + 1);
      pick();
    },
    [shown, mode, revealed, timedOut, difficulty, append, strategy, seed, pick],
  );

  // A hard cutoff reveals the comm when time runs out; the attempt then counts as wrong.
  const expire = useCallback(() => {
    revealMs.current = performance.now() - shownAt.current;
    setTimedOut(true);
    setRevealed(true);
  }, []);
  useHardCutoff(difficulty, shown === undefined ? undefined : `${shown.id}:${String(sessionCount)}`, mode === "recall" && !revealed && shown !== undefined, expire);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || document.querySelector("dialog[open]") !== null) return;
      if (event.key === " " && mode === "recall") {
        event.preventDefault();
        reveal();
      } else if (event.key === "j" || event.key === "J" || event.key === "ArrowRight") grade(true);
      else if (event.key === "f" || event.key === "F" || event.key === "ArrowLeft") grade(false);
      else if ((event.key === "n" || event.key === "N") && mode === "learn") pick();
      else if (event.key === "r" || event.key === "R") setReplay((n) => n + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [mode, reveal, grade, pick]);

  const shortcuts = [
    { keys: en.threeStyle.keySpace, action: en.threeStyle.keySpaceAction },
    { keys: en.threeStyle.keyRight, action: en.threeStyle.keyRightAction },
    { keys: en.threeStyle.keyWrong, action: en.threeStyle.keyWrongAction },
    { keys: en.threeStyle.keyN, action: en.threeStyle.keyNAction },
    { keys: en.threeStyle.keyR, action: en.threeStyle.keyRAction },
  ];
  const settings = (
    <>
      <Segmented<Pieces> label={en.threeStyle.pieces} options={PIECES} labels={en.threeStyle.pieceTypes} value={pieces} onChange={(v) => { setPieces(v); writePreference("bld.3style.pieces", v); }} />
      <Segmented<Mode> label={en.threeStyle.mode} options={MODES} labels={en.threeStyle.modes} value={mode} onChange={(v) => { setMode(v); writePreference("bld.3style.mode", v); setRevealed(false); }} />
      <Segmented<Strategy> label={en.threeStyle.order} options={STRATEGIES} labels={en.m2op.strategies} value={strategy} onChange={(v) => { setStrategy(v); writePreference("bld.3style.strategy", v); }} />
      <DifficultySummary subsets time seed />
    </>
  );
  const shell = (children: React.ReactNode, summary?: React.ReactNode, announce?: string) => (
    <TrainerShell title={en.threeStyle.title} intro={en.threeStyle.intro} lesson={pieces === "corners" ? { href: "/learn/three-style-corners/", title: en.threeStyle.lessonTitle } : { href: "/learn/three-style-edges/", title: en.threeStyle.lessonTitleEdges }} settings={settings} shortcuts={shortcuts} summary={summary} {...(announce === undefined ? {} : { announce })}>
      {children}
    </TrainerShell>
  );

  if (reader === undefined || built === undefined) return shell(<p className="t-meta text-quiet">{en.threeStyle.building}</p>);
  if (!built.ok || dataset === undefined) return shell(<p className="t-body" role="alert">{en.threeStyle.buildFailed(built.ok ? "" : built.reason)}</p>);

  const mastered = cases.filter((c) => schedules.get(c.id)?.mastered === true).length;
  const showAlg = mode === "learn" || revealed;
  const main = shown?.algs[0];
  const setup = main === undefined ? undefined : drillScramble(reader.puzzle, main.moves);
  const lit = shown === undefined ? [] : piecesOf(reader, [shown.buffer, shown.targets[0], shown.targets[1]]);

  const saveOverrides = async (next: AlgOverrides) => {
    await update({ algOverrides: next });
  };

  const exportAlgs = () => {
    const blob = new Blob([overridesFile(stored?.algOverrides ?? {})], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bldokja-3style-algs-${nowIso().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importAlgs = async (file: File) => {
    const { threeStyleCorners, threeStyleEdges } = algDatasets();
    const result = importOverrides(reader.puzzle, await file.text(), { corners: threeStyleCorners, edges: threeStyleEdges });
    if (!result.ok) {
      setMessage(en.threeStyle.importFailed);
      return;
    }
    let merged = stored?.algOverrides;
    for (const [datasetId, byCase] of Object.entries(result.overrides)) for (const [recordId, algs] of Object.entries(byCase)) for (const alg of [...algs].reverse()) merged = withUserAlg(merged, datasetId, recordId, alg);
    await update({ algOverrides: merged ?? {} });
    setMessage(en.threeStyle.imported(result.kept, result.rejected.length));
  };

  const panel =
    shown === undefined ? (
      <p className="t-body">{nothingDue ? en.threeStyle.nothingDue : en.threeStyle.building}</p>
    ) : (
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {setup?.ok === true && main !== undefined ? (
          showAlg ? (
            <Cube key={`${shown.id}-${main.alg}-${String(replay)}`} setup={setup.value.scramble} alg={main.moves} highlight={lit} controls autoplay label={en.threeStyle.caseTitle(shown.letters, shown.targets[0], shown.targets[1])} />
          ) : (
            <Cube key={`${shown.id}-still`} setup={setup.value.scramble} highlight={lit} label={en.threeStyle.caseTitle(shown.letters, shown.targets[0], shown.targets[1])} />
          )
        ) : null}
        <div className="flex flex-col gap-3 self-center">
          <p className="t-meta text-quiet">{en.threeStyle.buffer(shown.buffer, reader.letterOf(shown.buffer) ?? "?")}</p>
          <p className="t-subheading">
            <span className="casual text-[1.5rem]">{shown.letters}</span> · <span className="t-notation">{shown.targets[0]} → {shown.targets[1]}</span>
          </p>
          {!showAlg ? (
            <>
              <p className="t-body">{en.threeStyle.recallPrompt}</p>
              <div>
                <button type="button" className="btn btn-strong" onClick={reveal} aria-keyshortcuts="Space">{en.threeStyle.reveal}</button>
              </div>
            </>
          ) : main !== undefined ? (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="t-meta text-quiet">{en.threeStyle.comm}</dt>
                <dd className="t-notation">
                  {main.alg} {main.source === "yours" ? <span className="t-meta text-quiet">({en.threeStyle.yours})</span> : null}
                </dd>
                <dt className="t-meta text-quiet">{en.threeStyle.moves}</dt>
                <dd className="t-notation">
                  {main.moves} <span className="t-meta text-quiet">{en.threeStyle.etm(main.etm)}</span>
                </dd>
                <dt className="t-meta text-quiet">{en.threeStyle.inverse}</dt>
                <dd className="t-notation">
                  {main.inverse} <span className="t-meta text-quiet">· {main.inverseMoves}</span>
                </dd>
              </dl>
              {mode === "recall" && timedOut ? (
                <>
                  <p className="t-body font-[600]" role="status">{en.difficulty.timedOut}</p>
                  <div>
                    <button type="button" className="btn btn-strong" onClick={() => { grade(false); }} aria-keyshortcuts="F">{en.threeStyle.next}</button>
                  </div>
                </>
              ) : mode === "recall" ? (
                <>
                  {overTarget ? <p className="t-meta" role="status">{en.difficulty.overTarget}</p> : null}
                  <div className="flex gap-2">
                    <button type="button" className="btn" onClick={() => { grade(false); }} aria-keyshortcuts="F">{en.threeStyle.wrong}</button>
                    <button type="button" className="btn btn-strong" onClick={() => { grade(true); }} aria-keyshortcuts="J">{en.threeStyle.right}</button>
                  </div>
                </>
              ) : (
                <div>
                  <button type="button" className="btn btn-strong" onClick={pick} aria-keyshortcuts="N">{en.threeStyle.next}</button>
                </div>
              )}
              {shown.algs.length > 1 ? (
                <details>
                  <summary className="t-meta cursor-pointer">{en.threeStyle.alternates}</summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {shown.algs.slice(1).map((a) => (
                      <li key={a.alg} className="flex flex-wrap items-center gap-2">
                        <span className="t-notation">{a.alg}</span>
                        <span className="t-meta text-quiet">{en.threeStyle.etm(a.etm)}{a.source === "yours" ? ` · ${en.threeStyle.yours}` : ""}</span>
                        <button type="button" className="btn min-h-9 px-2" onClick={() => { void saveOverrides(withUserAlg(stored?.algOverrides, dataset.id, shown.recordId, a.alg)); }}>{en.threeStyle.makeMain}</button>
                        {a.source === "yours" ? <button type="button" className="btn min-h-9 px-2" onClick={() => { void saveOverrides(withoutUserAlg(stored?.algOverrides, dataset.id, shown.recordId, a.alg)); }}>{en.threeStyle.remove}</button> : null}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {main.source === "yours" ? (
                <div>
                  <button type="button" className="btn min-h-9 px-2" onClick={() => { void saveOverrides(withoutUserAlg(stored?.algOverrides, dataset.id, shown.recordId, main.alg)); }}>{en.threeStyle.remove}</button>
                </div>
              ) : null}
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const checked = checkUserAlg(reader.puzzle, dataset, shown.recordId, typed);
                  if (!checked.ok) {
                    setMessage(en.threeStyle.rejected[checked.reason]);
                    return;
                  }
                  void saveOverrides(withUserAlg(stored?.algOverrides, dataset.id, shown.recordId, checked.alg.alg)).then(() => {
                    setTyped("");
                    setMessage(en.threeStyle.added);
                  });
                }}
              >
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="t-meta text-quiet">{en.threeStyle.addYours}</span>
                  <input className="field t-notation" value={typed} placeholder={en.threeStyle.addPlaceholder} spellCheck={false} autoComplete="off" onChange={(e) => { setTyped(e.target.value); }} />
                </label>
                <button type="submit" className="btn" disabled={typed.trim() === ""}>{en.threeStyle.add}</button>
              </form>
            </>
          ) : null}
          {message !== undefined ? <p className="t-meta" role="status">{message}</p> : null}
        </div>
      </div>
    );

  const summary = (
    <div className="flex flex-col gap-3">
      {mode === "recall" ? <SessionReport reader={reader} trainer={THREE_STYLE_TRAINER} events={events} /> : null}
      <p className="t-meta">
        {en.threeStyle.progress(mastered, cases.length)} · {en.threeStyle.sessionCount(sessionCount)}
      </p>
      {rejected.length > 0 ? <p className="t-meta" role="alert">{en.threeStyle.rejectedStored(rejected.length)}</p> : null}
      {drilled.applied ? <p className="t-meta">{en.difficulty.subsetOn}</p> : null}
      <CaseGrid reader={reader} cases={cases} stickers={stickers} schedules={schedules} now={now} current={shown?.id} onPick={show} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={exportAlgs}>{en.threeStyle.export}</button>
        <label className="flex flex-col gap-1">
          <span className="t-meta text-quiet">{en.threeStyle.import}</span>
          <input type="file" accept="application/json,.json" className="field w-full min-w-0 max-w-full py-2" onChange={(e) => { const f = e.target.files?.[0]; if (f !== undefined) void importAlgs(f); }} />
        </label>
      </div>
      <p className="t-meta text-quiet">{Object.keys(en.trainer.mastery).map((k) => `${k}: ${String(cases.filter((c) => caseStatus(schedules.get(c.id), now) === k).length)}`).join(" · ")}</p>
    </div>
  );

  // Spoken when reading aloud is on: the case, then either the comm or the prompt to say it.
  return shell(
    panel,
    summary,
    shown === undefined ? undefined : announcement([`${shown.letters}, ${shown.targets[0]} to ${shown.targets[1]}`, showAlg ? main?.alg : en.threeStyle.recallPrompt]),
  );
}
