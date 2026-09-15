"use client";

import { createSelector, drillScramble, expandNodes, formatMoves, invertMoves, parseAlg, type Selector, type SelectionStrategy } from "@bld/cube-engine";
import { dueCases, reviewsByCase, scheduleAll, statsFor, type CaseSchedule } from "@bld/srs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cube } from "@/components/cube/cube";
import { LetterTile } from "@/components/letters/letters";
import { piecesOf } from "@/components/lesson/op-demos";
import { Segmented, TrainerShell } from "@/components/trainer/trainer-shell";
import { en } from "@/i18n/en";
import { m2opData, useMethodData } from "@/lib/methods";
import { useReader } from "@/lib/reader";
import { newId, nowIso } from "@/lib/storage-client";
import { readPreference, useEvents, writePreference } from "@/lib/use-events";
import { FAMILIES, familyOf, shotCases, type Family, type MethodDatasets, type ShotCase, type ShotMode } from "@/trainers/m2op-cases";
import { ScrambleDrillView } from "./scramble-drill";

type Mode = ShotMode | "scramble-op" | "scramble-m2" | "illegal";
type FamilyChoice = Family | "all";
type Strategy = Extract<SelectionStrategy, "coverage" | "weakness" | "uniform" | "spaced">;
const MODES: readonly Mode[] = ["op-corners", "op-edges", "m2-edges", "m2-special", "scramble-op", "scramble-m2", "illegal"];
const FAMILY_CHOICES: readonly FamilyChoice[] = ["all", ...FAMILIES];
const isShotMode = (m: Mode): m is ShotMode => m !== "illegal" && m !== "scramble-op" && m !== "scramble-m2";
const STRATEGIES: readonly Strategy[] = ["coverage", "weakness", "uniform", "spaced"];
const TRAINER = "m2op";

const isMode = (v: unknown): v is Mode => typeof v === "string" && (MODES as readonly string[]).includes(v);
const isStrategy = (v: unknown): v is Strategy => typeof v === "string" && (STRATEGIES as readonly string[]).includes(v);

interface IllegalExample {
  readonly id: string;
  readonly title: string;
  readonly moves: string;
  readonly damaged: readonly string[];
  readonly setup: string;
  readonly target: string;
  readonly rule: string;
  /** What to do instead, from the verified records. */
  readonly instead: string;
}

function inverseOf(setup: string): string {
  const parsed = parseAlg("3x3x3", setup);
  return parsed.ok ? formatMoves(invertMoves(expandNodes(parsed.value.nodes))) : "";
}

/** Every worked example of a forbidden or tempting setup the datasets carry, with its damage. */
function illegalExamples(datasets: MethodDatasets): IllegalExample[] {
  const { corners: opCorners, edges: opEdges } = datasets.op;
  const m2Edges = datasets.m2.edges;
  const legalFor = (setup: string | undefined) => (setup === undefined ? en.m2op.specialNote : setup === "" ? en.m2op.illegalOnSwapSpot : en.m2op.illegalLegal(setup));
  const op = (dataset: typeof opCorners, label: string) =>
    dataset.forbidden.map((f) => ({
      id: `${dataset.id}:${f.family}`,
      title: en.m2op.illegalFamily(label, f.family),
      rule: en.m2op.illegalRule(f.family, f.disturbs.join(", ")),
      instead: legalFor(dataset.records.find((r) => r.target === f.example.target)?.setup),
      setup: f.example.setup,
      target: f.example.target,
      moves: `${f.example.setup} ${dataset.swap.alg} ${inverseOf(f.example.setup)}`,
      damaged: f.example.damagedPieces,
    }));
  const m2 = m2Edges.tempting.map((t) => {
    const record = m2Edges.records.find((r) => r.target === t.target);
    return {
      id: `m2:${t.target}:${t.setup}`,
      title: en.m2op.illegalShortcut(en.m2op.modes["m2-edges"], t.target),
      rule: record?.kind === "target" ? en.m2op.illegalShortcutRule : en.m2op.illegalShortcutSpecial,
      instead: legalFor(record?.kind === "target" ? record.setup : undefined),
      setup: t.setup,
      target: t.target,
      moves: `${t.setup} ${m2Edges.swap.alg} ${inverseOf(t.setup)}`,
      damaged: t.damagedPieces,
    };
  });
  return [...op(opCorners, en.m2op.modes["op-corners"]), ...op(opEdges, en.m2op.modes["op-edges"]), ...m2];
}

/**
 * The M2/OP trainer (BRIEF §7.2). Drill by target, the M2 special cases in both positions, or the
 * "why is this setup illegal?" mode. For a target you recall the setup, reveal the setup, swap and
 * undo, and mark yourself (your 2026-09-15 answer). The order comes from the engine's selection
 * strategies over FSRS schedules rebuilt from your history; mastery per case is shown alongside.
 */
export function M2OpTrainer() {
  const reader = useReader();
  const { events, append } = useEvents();
  const [mode, setMode] = useState<Mode>(() => readPreference("bld.m2op.mode", "op-corners", isMode));
  const [strategy, setStrategy] = useState<Strategy>(() => readPreference("bld.m2op.strategy", "coverage", isStrategy));
  const [sighted, setSighted] = useState(false);
  const [family, setFamily] = useState<FamilyChoice>("all");
  const [seed] = useState(() => newId());
  const [current, setCurrent] = useState<ShotCase | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [replay, setReplay] = useState(0);
  const [nothingDue, setNothingDue] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [illegalIndex, setIllegalIndex] = useState(0);
  const promptStart = useRef(0);
  const revealMs = useRef(0);
  const selector = useRef<Selector | undefined>(undefined);

  const built = useMethodData(reader, m2opData);
  const datasets = built?.ok === true ? built.value : undefined;
  const cases = useMemo(() => {
    if (reader === undefined || datasets === undefined || !isShotMode(mode)) return [];
    const all = shotCases(mode, datasets, reader.scheme);
    return family === "all" || mode === "m2-special" ? all : all.filter((c) => familyOf(c.target) === family);
  }, [reader, datasets, mode, family]);
  const examples = useMemo(() => (datasets === undefined ? [] : illegalExamples(datasets)), [datasets]);
  const schedules = useMemo<Map<string, CaseSchedule>>(() => scheduleAll(cases.map((c) => c.id), reviewsByCase(events ?? [], TRAINER), new Date()), [cases, events]);

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
    const created = createSelector({ strategy, cases: cases.map((c) => c.id), seed: `${seed}:${mode}:${family}:${strategy}` });
    selector.current = created.ok ? created.value : undefined;
    pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-picking on every event would skip cases
  }, [cases, strategy, seed, mode, family, events === undefined]);

  const reveal = useCallback(() => {
    if (current === undefined || revealed) return;
    revealMs.current = Math.round(performance.now() - promptStart.current);
    setRevealed(true);
  }, [current, revealed]);

  const grade = useCallback(
    (correct: boolean) => {
      if (current === undefined || !revealed) return;
      void append([{ id: newId(), type: "drill.attempt", at: nowIso(), trainer: TRAINER, caseId: current.id, strategy, seed, correct, responseMs: revealMs.current, detail: { mode: current.mode, target: current.target, sighted, ...(current.position === undefined ? {} : { position: current.position }) } }]);
      setSessionCount((n) => n + 1);
      pick();
    },
    [current, revealed, append, strategy, seed, sighted, pick],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || !isShotMode(mode) && mode !== "illegal") return;
      if (mode === "illegal") {
        if (event.key === "Enter" || event.key === "ArrowRight") setIllegalIndex((i) => (i + 1) % examples.length);
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
  }, [mode, reveal, grade, examples.length]);

  const settings = (
    <>
      <Segmented<Mode> label={en.m2op.mode} options={MODES} labels={en.m2op.modes} value={mode} onChange={(v) => { setMode(v); writePreference("bld.m2op.mode", v); }} />
      {isShotMode(mode) ? <Segmented<Strategy> label={en.m2op.strategy} options={STRATEGIES} labels={en.m2op.strategies} value={strategy} onChange={(v) => { setStrategy(v); writePreference("bld.m2op.strategy", v); }} /> : null}
      {isShotMode(mode) && mode !== "m2-special" ? <Segmented<FamilyChoice> label={en.m2op.family} options={FAMILY_CHOICES} labels={en.m2op.families} value={family} onChange={setFamily} /> : null}
      <label className="flex items-center gap-2 t-ui">
        <input type="checkbox" checked={sighted} onChange={(e) => { setSighted(e.target.checked); }} />
        {en.m2op.sighted}
      </label>
    </>
  );

  const shortcuts =
    mode === "illegal"
      ? [{ keys: "Enter", action: en.m2op.illegalNext }]
      : [
          { keys: en.m2op.keySpace, action: en.m2op.keySpaceAction },
          { keys: en.m2op.keyRight, action: en.m2op.keyRightAction },
          { keys: en.m2op.keyWrong, action: en.m2op.keyWrongAction },
          { keys: en.m2op.keyR, action: en.m2op.keyRAction },
          ...(isShotMode(mode) ? [] : [{ keys: en.m2op.keyN, action: en.m2op.keyNAction }]),
        ];

  const shell = (children: React.ReactNode, summary?: React.ReactNode) => (
    <TrainerShell title={en.m2op.title} intro={en.m2op.intro} lesson={{ href: mode === "op-edges" ? "/learn/op-edges/" : "/learn/op-corners/", title: mode === "op-edges" ? "Old Pochmann edges" : en.m2op.lessonTitle }} settings={settings} shortcuts={shortcuts} summary={summary}>
      {children}
    </TrainerShell>
  );

  if (reader === undefined || built === undefined) return shell(<p className="t-meta text-quiet">{en.trainer.loading}</p>);
  if (!built.ok || datasets === undefined) return shell(<p className="t-body" role="alert">{en.m2op.buffersFailed(built.ok ? "" : built.reason)}</p>);

  if (mode === "scramble-op" || mode === "scramble-m2") return shell(<ScrambleDrillView reader={reader} datasets={datasets} method={mode === "scramble-op" ? "op" : "m2"} sighted={sighted} seed={seed} append={append} />);

  if (mode === "illegal") {
    const example = examples[illegalIndex % examples.length];
    if (example === undefined) return shell(null);
    return shell(
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Cube key={example.id} alg={example.moves} highlight={piecesOf(reader, example.damaged)} controls label={en.lesson.illegalLabel(example.setup, example.target)} tempo={sighted ? 0.5 : 1} />
        <div className="flex flex-col gap-3 self-center">
          <p className="t-subheading">{example.title}</p>
          <p className="t-body">{en.lesson.illegalSetup(example.setup, example.target)}</p>
          <p className="t-body">{example.rule}</p>
          <p className="t-body text-quiet">{en.lesson.illegalDamaged(example.damaged.join(", "))}</p>
          <p className="t-body">{example.instead}</p>
          <div>
            <button type="button" className="btn btn-strong" onClick={() => { setIllegalIndex((i) => (i + 1) % examples.length); }}>{en.m2op.illegalNext}</button>
          </div>
        </div>
      </div>,
    );
  }

  const mastered = cases.filter((c) => schedules.get(c.id)?.mastered === true).length;
  const due = new Set(dueCases(schedules, new Date()));
  const status = (c: ShotCase) => {
    const s = schedules.get(c.id);
    if (s === undefined || s.reviews === 0) return en.m2op.newCase;
    if (s.mastered) return en.m2op.mastered;
    if (due.has(c.id)) return en.m2op.due;
    return en.m2op.learning;
  };

  const masteryPanel = (
    <div className="flex flex-col gap-3">
      <p className="t-meta">
        {en.m2op.progress(mastered, cases.length)} · {en.m2op.sessionCount(sessionCount)}
      </p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
        {cases.map((c) => (
          <li key={c.id} className={`flex items-center gap-2 rounded-[4px] border px-2 py-1 ${current?.id === c.id ? "border-text" : "border-rule"}`}>
            <LetterTile letter={c.letter} face={reader.faceOf(c.target)} size="small" />
            <span className="flex flex-col">
              <span className="t-meta mono">
                {c.target}
                {c.position === undefined ? "" : ` · ${c.position === "odd" ? en.m2op.oddPosition : en.m2op.evenPosition}`}
              </span>
              <span className="t-meta text-quiet">{status(c)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  if (current === undefined) return shell(<p className="t-body">{nothingDue ? en.m2op.nothingDue : en.trainer.loading}</p>, masteryPanel);

  const setupState = drillScramble(reader.puzzle, current.moves);
  const undo = current.setup === "" ? "" : inverseOf(current.setup);
  const core = current.setup === "" ? current.notation : mode === "m2-edges" || mode === "m2-special" ? datasets.m2.edges.swap.alg : (mode === "op-edges" ? datasets.op.edges : datasets.op.corners).swap.alg;

  return shell(
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        {revealed && setupState.ok ? (
          <Cube key={`${current.id}-${replay}`} setup={setupState.value.scramble} alg={current.moves} highlight={piecesOf(reader, current.lit)} controls autoplay={!sighted} tempo={sighted ? 0.5 : 1} label={en.lesson.opShotLabel(current.target, current.letter)} />
        ) : (
          <div className="grid aspect-square w-full max-w-[28rem] place-items-center self-center rounded-[4px] bg-stage">
            <div className="flex flex-col items-center gap-3">
              <LetterTile letter={current.letter} face={reader.faceOf(current.target)} label={`${en.m2op.target} ${current.letter}`} />
              <span className="t-notation">{current.target}</span>
              {current.position !== undefined ? <span className="t-meta">{current.position === "odd" ? en.m2op.oddPosition : en.m2op.evenPosition}</span> : null}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4 self-center">
        <p className="t-subheading">
          {en.m2op.target} {current.letter} · <span className="t-notation">{current.target}</span>
          {current.position !== undefined ? ` · ${current.position === "odd" ? en.m2op.oddPosition : en.m2op.evenPosition}` : ""}
        </p>
        {!revealed ? (
          <>
            <p className="t-body">{en.m2op.recall}</p>
            <div>
              <button type="button" className="btn btn-strong" onClick={reveal} aria-keyshortcuts="Space">{en.m2op.reveal}</button>
            </div>
          </>
        ) : (
          <>
            {current.shootAs !== undefined ? <p className="t-body font-[600]">{en.m2op.shootAs(current.shootAs)}</p> : null}
            {current.setup === "" && (mode === "m2-edges" || mode === "m2-special") ? <p className="t-meta text-quiet">{en.m2op.specialNote}</p> : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {current.setup !== "" ? (
                <>
                  <dt className="t-meta text-quiet">{en.m2op.setup}</dt>
                  <dd className="t-notation">{current.setup}</dd>
                  <dt className="t-meta text-quiet">{en.m2op.swap}</dt>
                  <dd className="t-notation">{core}</dd>
                  <dt className="t-meta text-quiet">{en.m2op.undo}</dt>
                  <dd className="t-notation">{undo}</dd>
                </>
              ) : (
                <>
                  <dt className="t-meta text-quiet">{en.m2op.alg}</dt>
                  <dd className="t-notation">{current.notation}</dd>
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
    </div>,
    masteryPanel,
  );
}
