"use client";

import { createSelector, type Selector } from "@bld/cube-engine";
import { dueCases, reviewsByCase, scheduleAll, statsFor, type CaseSchedule } from "@bld/srs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cube } from "@/components/cube/cube";
import { LetterTile } from "@/components/letters/letters";
import { SessionReport } from "@/components/trainer/session-report";
import { Segmented, TrainerShell } from "@/components/trainer/trainer-shell";
import { algDatasets } from "@/content/algs";
import { en } from "@/i18n/en";
import { shortcutIgnored } from "@/lib/keyboard";
import { stickersOfPieces } from "@/lib/reader-4x4";
import { announcement } from "@/lib/speech";
import { newId, nowIso } from "@/lib/storage-client";
import { readPreference, writePreference } from "@/lib/use-events";
import { FOUR_BLD_TRAINER, shotCases, shotSetup, specialShots, undoOf, type Shot, type ShotMode } from "@/trainers/four-bld";
import { isStrategy, lessonFor, STRATEGIES, type DrillProps, type Strategy } from "./four-bld-trainer";

const STRATEGY_KEY = "bld.4bld.strategy";

/**
 * The r2 and U2 drills, the 4x4 twin of the M2/OP trainer: recall the setup (or a special case's alg),
 * reveal it animated on a 4x4 with only the buffer, the target and the swap slot lit, and mark yourself.
 * Special cases have their own mode, in both positions, because on an odd step they're shot as their partner.
 */
export function ShotDrill({ reader, events, append, settings, mode }: DrillProps & { mode: ShotMode }) {
  const method = mode === "r2" || mode === "r2-special" ? "r2" : "u2";
  const [strategy, setStrategy] = useState<Strategy>(() => readPreference(STRATEGY_KEY, "coverage", isStrategy));
  const [seed] = useState(() => newId());
  const [current, setCurrent] = useState<Shot | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [replay, setReplay] = useState(0);
  const [nothingDue, setNothingDue] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const promptStart = useRef(0);
  const revealMs = useRef(0);
  const selector = useRef<Selector | undefined>(undefined);

  const dataset = method === "r2" ? algDatasets().r2Wings : algDatasets().u2Centres;
  const pieces = method === "r2" ? "wings" : "xcenters";
  const cases = useMemo(() => (mode.endsWith("-special") ? specialShots(dataset, reader, pieces) : shotCases(dataset, reader, pieces)), [mode, dataset, reader, pieces]);
  const schedules = useMemo<Map<string, CaseSchedule>>(() => scheduleAll(cases.map((c) => c.id), reviewsByCase(events ?? [], FOUR_BLD_TRAINER), new Date()), [cases, events]);

  const pick = useCallback(() => {
    if (selector.current === undefined) return;
    const next = selector.current.next({ stats: (id) => statsFor(schedules.get(id)), now: Date.now() });
    setRevealed(false);
    if (!next.ok) {
      setCurrent(undefined);
      setNothingDue(next.error.reason === "nothing-due");
      return;
    }
    setNothingDue(false);
    setCurrent(cases.find((c) => c.id === next.value));
    promptStart.current = performance.now();
  }, [cases, schedules]);

  // A new selector whenever the case set or the order changes; events only update the stats it reads.
  useEffect(() => {
    if (cases.length === 0 || events === undefined) return;
    const created = createSelector({ strategy, cases: cases.map((c) => c.id), seed: `${seed}:${mode}:${strategy}` });
    selector.current = created.ok ? created.value : undefined;
    pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-picking on every event would skip cases
  }, [cases, strategy, seed, mode, events === undefined]);

  const reveal = useCallback(() => {
    if (current === undefined || revealed) return;
    revealMs.current = Math.round(performance.now() - promptStart.current);
    setRevealed(true);
  }, [current, revealed]);

  const grade = useCallback(
    (correct: boolean) => {
      if (current === undefined || !revealed) return;
      void append([{ id: newId(), type: "drill.attempt", at: nowIso(), trainer: FOUR_BLD_TRAINER, caseId: current.id, strategy, seed, correct, responseMs: revealMs.current, detail: { mode, target: current.target, ...(current.position === undefined ? {} : { position: current.position }) } }]);
      setSessionCount((n) => n + 1);
      pick();
    },
    [current, revealed, append, strategy, seed, mode, pick],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcutIgnored(event)) return;
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
  }, [reveal, grade]);

  const positionName = (c: Shot) => (c.position === undefined ? undefined : c.position === "odd" ? en.fourBld.oddPosition : en.fourBld.evenPosition);
  const due = new Set(dueCases(schedules, new Date()));
  const status = (c: Shot) => {
    const s = schedules.get(c.id);
    if (s === undefined || s.reviews === 0) return en.fourBld.status.new;
    if (s.mastered) return en.fourBld.status.mastered;
    if (due.has(c.id)) return en.fourBld.status.due;
    return en.fourBld.status.learning;
  };
  const mastered = cases.filter((c) => schedules.get(c.id)?.mastered === true).length;

  const summary = (
    <div className="flex flex-col gap-3">
      <SessionReport reader={reader} trainer={FOUR_BLD_TRAINER} events={events} />
      <p className="t-meta">
        {en.fourBld.progress(mastered, cases.length)} · {en.fourBld.sessionCount(sessionCount)}
      </p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
        {cases.map((c) => (
          <li key={c.id} className={`flex items-center gap-2 rounded-[4px] border px-2 py-1 ${current?.id === c.id ? "border-text" : "border-rule"}`}>
            <LetterTile letter={c.letter} face={reader.faceOf(c.target)} size="small" />
            <span className="flex flex-col">
              <span className="t-meta mono">
                {c.target}
                {c.position === undefined ? "" : ` · ${positionName(c) ?? ""}`}
              </span>
              <span className="t-meta text-quiet">{status(c)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  const allSettings = (
    <>
      {settings}
      <Segmented<Strategy> label={en.fourBld.strategy} options={STRATEGIES} labels={en.fourBld.strategies} value={strategy} onChange={(v) => { setStrategy(v); writePreference(STRATEGY_KEY, v); }} />
    </>
  );

  const shortcuts = [
    { keys: en.fourBld.keySpace, action: en.fourBld.keySpaceAction },
    { keys: en.fourBld.keyRight, action: en.fourBld.keyRightAction },
    { keys: en.fourBld.keyWrong, action: en.fourBld.keyWrongAction },
    { keys: en.fourBld.keyR, action: en.fourBld.keyRAction },
  ];

  if (current === undefined) {
    return (
      <TrainerShell title={en.fourBld.title} intro={en.fourBld.intro} lesson={lessonFor(mode)} settings={allSettings} shortcuts={shortcuts} summary={summary}>
        <p className="t-body">{nothingDue ? en.fourBld.nothingDue : en.fourBld.loading}</p>
      </TrainerShell>
    );
  }

  const setup = shotSetup(reader.puzzle, current);
  const lit = stickersOfPieces(reader, current.lit);
  const special = current.setup === "";
  const recall = special && current.notation !== dataset.swap.alg ? en.fourBld.recallSpecial : en.fourBld.recall;

  return (
    <TrainerShell
      title={en.fourBld.title}
      intro={en.fourBld.intro}
      lesson={lessonFor(mode)}
      settings={allSettings}
      shortcuts={shortcuts}
      summary={summary}
      announce={announcement([`${en.m2op.target} ${current.letter}, ${current.target}`, positionName(current), revealed ? (special ? current.notation : `${en.fourBld.setup}: ${current.setup}`) : recall])}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          {revealed && setup !== undefined ? (
            <Cube key={`${current.id}-${String(replay)}`} puzzleId="4x4x4" setup={setup} alg={current.moves} highlight={lit} dim={method === "u2" ? "soft" : "strong"} controls autoplay label={en.fourBld.shotLabel(current.target, current.letter)} />
          ) : (
            <div className="grid aspect-square w-full max-w-[28rem] place-items-center self-center rounded-[4px] bg-stage">
              <div className="flex flex-col items-center gap-3">
                <LetterTile letter={current.letter} face={reader.faceOf(current.target)} label={`${en.m2op.target} ${current.letter}`} />
                <span className="t-notation">{current.target}</span>
                {current.position !== undefined ? <span className="t-meta">{positionName(current)}</span> : null}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4 self-center">
          <p className="t-subheading">
            {en.m2op.target} {current.letter} · <span className="t-notation">{current.target}</span>
            {current.position !== undefined ? ` · ${positionName(current) ?? ""}` : ""}
          </p>
          {!revealed ? (
            <>
              <p className="t-body">{recall}</p>
              <div>
                <button type="button" className="btn btn-strong" onClick={reveal} aria-keyshortcuts="Space">{en.fourBld.reveal}</button>
              </div>
            </>
          ) : (
            <>
              {current.shootAs !== undefined ? <p className="t-body font-[600]">{en.fourBld.shootAs(current.shootAs)}</p> : null}
              {special ? <p className="t-meta text-quiet">{current.notation === dataset.swap.alg ? en.fourBld.freeNote : en.fourBld.specialNote}</p> : null}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {!special ? (
                  <>
                    <dt className="t-meta text-quiet">{en.fourBld.setup}</dt>
                    <dd className="t-notation">{current.setup}</dd>
                    <dt className="t-meta text-quiet">{en.fourBld.swap}</dt>
                    <dd className="t-notation">{dataset.swap.alg}</dd>
                    <dt className="t-meta text-quiet">{en.fourBld.undo}</dt>
                    <dd className="t-notation">{undoOf(reader.puzzle, current.setup)}</dd>
                  </>
                ) : (
                  <>
                    <dt className="t-meta text-quiet">{en.fourBld.alg}</dt>
                    <dd className="t-notation">{current.notation}</dd>
                  </>
                )}
              </dl>
              <p className="t-meta text-quiet">{en.fourBld.notation}</p>
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => { grade(false); }} aria-keyshortcuts="F">{en.fourBld.iDidNot}</button>
                <button type="button" className="btn btn-strong" onClick={() => { grade(true); }} aria-keyshortcuts="J">{en.fourBld.iHadIt}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </TrainerShell>
  );
}
