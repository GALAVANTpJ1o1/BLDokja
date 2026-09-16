"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { PieceColours } from "@/components/cube/piece-colours";
import { piecesOf } from "@/lib/cube-highlights";
import { explore } from "@/i18n/explore";
import { LetterNotch } from "@/components/letters/letters";
import { useVoice } from "@/components/lesson/use-voice";
import { useSettings } from "@/components/settings/settings-provider";
import { DifficultySummary } from "@/components/trainer/difficulty-summary";
import { SessionReport } from "@/components/trainer/session-report";
import { Segmented, TrainerShell } from "@/components/trainer/trainer-shell";
import { en } from "@/i18n/en";
import { polish } from "@/i18n/polish";
import { shortcutIgnored } from "@/lib/keyboard";
import { voiced } from "@/i18n/voiced";
import { useReader } from "@/lib/reader";
import { announcement } from "@/lib/speech";
import { ScrambleControls, useScramble } from "@/lib/use-scramble";
import { newId, nowIso } from "@/lib/storage-client";
import { readPreference, useEvents, writePreference } from "@/lib/use-events";
import { constrainedScramble, timeVerdict, traceConstraints, type ConstrainedScramble } from "@/trainers/difficulty";
import { afterScramble, chooseLevel, explanationWanted, lookupKind, resumeAuto, scrambleTraces, startRamp, summarise, type Level, type LookupKind, type RampState, type TargetResult, type TracePieces } from "@/trainers/guided-trace";

const RAMP_KEY = "bld.trace.ramp";
const PIECES_KEY = "bld.trace.pieces";

const isRamp = (v: unknown): v is RampState =>
  typeof v === "object" && v !== null && [1, 2, 3, 4].includes((v as RampState).level) && typeof (v as RampState).auto === "boolean" && Array.isArray((v as RampState).streak);
const isPieces = (v: unknown): v is TracePieces => v === "both" || v === "edges" || v === "corners";

function randomSeed(): string {
  return newId().replace(/-/g, "").slice(0, 10);
}

/**
 * Guided trace mode (BRIEF §7.1). A seeded random scramble; the cube lights the buffer and the sticker
 * to read, less as the ramp rises; each letter is typed and checked; wrong letters are shown and
 * retyped; cycle breaks and twists are explained until you've got three of each right; every target's
 * time and correctness go to the event log for the analytics phase.
 */
export function TraceTrainer() {
  const reader = useReader();
  const voice = useVoice();
  const { events, append } = useEvents();
  const { stored } = useSettings();
  const difficulty = stored?.difficulty;
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);

  // This component only renders in the browser (see page.tsx), so the URL and localStorage can be read up front.
  const [urlSeed] = useState(() => new URLSearchParams(window.location.search).get("seed"));
  // A seed in the address wins, then one you type or ask for here, then the difficulty settings' seed, then a random one.
  const [seedChoice, setSeed] = useState<string | undefined>(() => (urlSeed !== null && urlSeed !== "" ? urlSeed : undefined));
  const [fallbackSeed] = useState(randomSeed);
  const seed: string = seedChoice ?? difficulty?.seed ?? fallbackSeed;
  const [index, setIndex] = useState(0);
  const [piecesPreference] = useState<TracePieces>(() => readPreference(PIECES_KEY, "both", isPieces));
  const [piecesChoice, setPieces] = useState<TracePieces | undefined>(undefined);
  // Your choice here wins for this session, then the difficulty settings' piece filter, then your last choice.
  const pieces: TracePieces = piecesChoice ?? difficulty?.pieces ?? piecesPreference;
  const [ramp, setRamp] = useState<RampState>(() => readPreference(RAMP_KEY, startRamp(), isRamp));
  const [position, setPosition] = useState(0);
  const [review, setReview] = useState<{ key: string; position: number }>();
  const [typed, setTyped] = useState("");
  const [mustRetype, setMustRetype] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | undefined>(undefined);
  const [results, setResults] = useState<TargetResult[]>([]);
  const [looked, setLooked] = useState<number | undefined>(undefined);
  const [forceExplain, setForceExplain] = useState(false);
  const [change, setChange] = useState<"up" | "down" | undefined>(undefined);
  const [relooks, setRelooks] = useState(0);
  const [constrained, setConstrained] = useState<{ key: string; result: ConstrainedScramble } | undefined>(undefined);
  const promptStart = useRef(0);
  const scrambleStart = useRef(0);
  const counted = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", seed);
    window.history.replaceState(null, "", url);
  }, [seed]);

  // With scramble limits set, each scramble comes from the engine's constrained generation (traced again before use).
  const constraints = useMemo(() => {
    const all = traceConstraints(difficulty);
    if (all === undefined) return undefined;
    const kept = Object.fromEntries(Object.entries(all).filter(([name]) => pieces === "both" || name === pieces));
    return Object.keys(kept).length === 0 ? undefined : kept;
  }, [difficulty, pieces]);
  const constraintKey = reader === undefined || constraints === undefined ? "" : JSON.stringify([seed, index, constraints, reader.buffers.op, reader.scheme.id]);
  useEffect(() => {
    if (reader === undefined || constraints === undefined) return;
    let cancelled = false;
    void constrainedScramble(reader.puzzle, reader.scheme, reader.buffers.op, constraints, seed, index).then((result) => {
      if (!cancelled) setConstrained({ key: constraintKey, result });
    });
    return () => {
      cancelled = true;
    };
  }, [reader, seed, index, constraints, constraintKey]);
  const random = useScramble(reader?.puzzle, seed, index, constraints === undefined);
  const scramble = constraints === undefined ? random.scramble : constrained?.key === constraintKey && constrained.result.ok ? constrained.result.scramble : undefined;
  const noMatch = constraints !== undefined && constrained?.key === constraintKey && !constrained.result.ok;
  const traces = useMemo(() => (reader === undefined || scramble === undefined ? [] : scrambleTraces(reader.puzzle, reader.scheme, scramble, pieces, reader.buffers.op)), [reader, scramble, pieces]);
  const flat = useMemo(() => traces.flatMap((t) => t.steps.map((step) => ({ pieceType: t.pieceType, buffer: t.buffer, step }))), [traces]);
  const current = flat[position];
  const reviewKey = JSON.stringify([seed, index, pieces, scramble]);
  const reviewPosition = review?.key === reviewKey ? review.position : undefined;
  const done = scramble !== undefined && flat.length > 0 && current === undefined;
  const lookPhase = ramp.level === 4 && looked === undefined && !done;

  const correctSoFar = useMemo(() => {
    const counts: Partial<Record<LookupKind, number>> = {};
    for (const e of events ?? []) {
      if (e.type !== "drill.attempt" || e.trainer !== "trace" || !e.correct) continue;
      const kind = e.detail?.kind;
      if (kind === "break" || kind === "twist") counts[kind] = (counts[kind] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  useEffect(() => {
    promptStart.current = performance.now();
  }, [position, index, looked]);


  useEffect(() => {
    scrambleStart.current = performance.now();
    counted.current = false;
  }, [index, seed, pieces]);

  // When a scramble is finished, feed its errors to the ramp once.
  const summary = useMemo(() => (done ? summarise(results) : undefined), [done, results]);
  useEffect(() => {
    if (summary === undefined || counted.current) return;
    counted.current = true;
    setRamp((state) => {
      const next = afterScramble(state, summary.errors);
      setChange(next.changed);
      const { changed: _changed, ...stored } = next;
      writePreference(RAMP_KEY, stored);
      return stored;
    });
  }, [summary]);

  const nextScramble = useCallback(() => {
    setReview(undefined);
    setIndex((i) => i + 1);
    setPosition(0);
    setResults([]);
    setTyped("");
    setMustRetype(undefined);
    setFeedback(undefined);
    setLooked(undefined);
    setChange(undefined);
    setForceExplain(false);
    setRelooks(0);
    input.current?.focus();
  }, []);

  const hideCube = useCallback(() => {
    setLooked(performance.now() - scrambleStart.current);
    setTimeout(() => input.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcutIgnored(event)) return;
      if (reviewPosition !== undefined) return;
      const inField = event.target instanceof HTMLInputElement;
      if (done && (event.key === "n" || event.key === "N" || (event.key === "Enter" && !inField))) {
        event.preventDefault();
        nextScramble();
      } else if (lookPhase && event.key === " ") {
        event.preventDefault();
        hideCube();
      } else if (!inField && (event.key === "e" || event.key === "E")) {
        setForceExplain(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [done, lookPhase, nextScramble, hideCube, reviewPosition]);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    input.current?.focus();
    if (current === undefined || scramble === undefined) return;
    if (done && typed === "") return;
    const answer = typed.trim().toLocaleUpperCase("en-GB");
    const expected = current.step.letter.toLocaleUpperCase("en-GB");
    if (mustRetype !== undefined) {
      if (answer === expected) {
        setFeedback(undefined);
        setMustRetype(undefined);
        setTyped("");
        setForceExplain(false);
        setPosition((p) => p + 1);
      }
      return;
    }
    const responseMs = Math.round(performance.now() - promptStart.current);
    const kind = lookupKind(current.step);
    const verdict = timeVerdict(difficulty, responseMs);
    const correct = answer === expected && verdict !== "timed-out";
    setResults((r) => [...r, { kind, correct, responseMs }]);
    void append([
      {
        id: newId(),
        type: "drill.attempt",
        at: nowIso(),
        trainer: "trace",
        caseId: `${current.pieceType}:${current.step.target}`,
        seed,
        correct,
        responseMs,
        detail: { kind, level: ramp.level, index: current.step.index, pieceType: current.pieceType, letter: current.step.letter, typed: answer, scramble, scrambleIndex: index, time: verdict, relooks, ...(looked === undefined ? {} : { lookMs: Math.round(looked) }) },
      },
    ]);
    setTyped("");
    if (correct) {
      setFeedback({ ok: true, text: `${voiced.traceCorrect[voice](current.step.letter)}${verdict === "over-target" ? ` ${en.difficulty.overTarget}` : ""}` });
      setForceExplain(false);
      setPosition((p) => p + 1);
    } else {
      setFeedback({ ok: false, text: verdict === "timed-out" ? `${en.difficulty.timedOut} ${en.trace.retype(current.step.letter)}` : voiced.traceWrong[voice](current.step.letter) });
      setMustRetype(current.step.letter);
    }
  };

  const reviewing = reviewPosition !== undefined;
  const shown = reviewPosition === undefined ? current : flat[reviewPosition];
  const highlight = reader === undefined || shown === undefined || (!reviewing && ramp.level >= 3) ? undefined : piecesOf(reader, [reviewing || ramp.level === 1 ? shown.step.look : shown.buffer]);
  const kind = current === undefined ? undefined : lookupKind(current.step);
  const explanation = current !== undefined && kind !== undefined && explanationWanted(kind, correctSoFar, forceExplain) ? (current.step.chosen ? (kind === "twist" ? voiced.traceTwist[voice]() : voiced.traceBreak[voice]()) : voiced.traceLook[voice]()) : undefined;
  const memoSoFar = flat.slice(0, done ? flat.length : position);

  const settings = (
    <>
      {constraints === undefined ? <ScrambleControls state={random} onChange={() => { setPosition(0); setResults([]); setLooked(undefined); setTyped(""); setMustRetype(undefined); setFeedback(undefined); counted.current = false; }} {...(reader === undefined ? {} : { puzzle: reader.puzzle })} /> : null}
      <p className="t-meta text-quiet">{polish.scramble.provisional}</p>
      <Segmented<TracePieces> label={en.trace.pieces} options={["both", "edges", "corners"]} labels={en.trace.pieceOptions} value={pieces} onChange={(v) => { setPieces(v); writePreference(PIECES_KEY, v); setPosition(0); setResults([]); setLooked(undefined); }} />
      <Segmented<"1" | "2" | "3" | "4"> label={en.trace.level} options={["1", "2", "3", "4"]} labels={en.trace.levels} value={String(ramp.level) as "1" | "2" | "3" | "4"} onChange={(v) => { const next = chooseLevel(Number(v) as Level); setRamp(next); writePreference(RAMP_KEY, next); setLooked(undefined); }} />
      <label className="flex items-center gap-2 t-ui">
        <input type="checkbox" checked={ramp.auto} onChange={(e) => { const next = e.target.checked ? resumeAuto(ramp) : { ...ramp, auto: false }; setRamp(next); writePreference(RAMP_KEY, next); }} />
        {en.trace.auto}
      </label>
      {!ramp.auto ? <p className="t-meta text-quiet">{en.trace.autoOff}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 t-ui">
          {en.trainer.seed}
          <input className="field mono w-48" value={seed} onChange={(e) => { setSeed(e.target.value); setIndex(0); setPosition(0); setResults([]); setLooked(undefined); }} />
        </label>
        <button type="button" className="btn" onClick={() => { setSeed(randomSeed()); setIndex(0); setPosition(0); setResults([]); setLooked(undefined); }}>{en.trainer.newSeed}</button>
      </div>
      <p className="t-meta text-quiet">{en.trainer.seedHint}</p>
      <DifficultySummary scrambles time relook seed />
    </>
  );

  const shortcuts = [
    { keys: en.trace.keyEnter, action: en.trace.keyEnterAction },
    { keys: en.trace.keyN, action: en.trace.keyNAction },
    { keys: en.trace.keySpace, action: en.trace.keySpaceAction },
    { keys: en.trace.keyE, action: en.trace.keyEAction },
  ];

  if (reader === undefined || scramble === undefined) {
    return (
      <TrainerShell title={en.trace.title} intro={en.trace.intro} lesson={{ href: "/learn/tracing-a-cycle/", title: en.trace.lessonTitle }} settings={settings} shortcuts={shortcuts}>
        {random.failed ? <ScrambleControls state={random} {...(reader === undefined ? {} : { puzzle: reader.puzzle })} /> : <p className="t-meta text-quiet" role={noMatch ? "alert" : "status"}>{noMatch ? en.difficulty.noMatch : constraints !== undefined ? en.difficulty.finding : polish.scramble.loading}</p>}
      </TrainerShell>
    );
  }

  const cubeHidden = ramp.level === 4 && looked !== undefined && !done;
  // What the trainer says out loud when reading aloud is on (BRIEF §10).
  const announce = lookPhase
    ? en.trace.lookFirst
    : current === undefined
      ? undefined
      // The feedback line already says which letter to retype, so it isn't repeated here.
      : announcement([en.trace.target(position + 1, flat.length), explanation, feedback?.text]);

  return (
    <TrainerShell
      title={en.trace.title}
      intro={en.trace.intro}
      lesson={{ href: "/learn/tracing-a-cycle/", title: en.trace.lessonTitle }}
      settings={settings}
      shortcuts={shortcuts}
      {...(announce === undefined ? {} : { announce })}
      summary={
        summary !== undefined ? (
          <div className="flex flex-col gap-3" role="status">
            <h2 className="t-heading">{en.trace.summaryTitle}</h2>
            <p className="t-body">{en.trace.accuracy(summary.errors, summary.targets)}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {(Object.entries(summary.medianMs) as [LookupKind, number][]).map(([k, ms]) => (
                <div key={k} className="contents">
                  <dt className="t-meta text-quiet">{en.trace.kinds[k]}</dt>
                  <dd className="t-notation">{en.trace.seconds(ms)}</dd>
                </div>
              ))}
            </dl>
            {looked !== undefined ? <p className="t-meta">{en.trace.lookTime(looked)}</p> : null}
            {change === "up" ? <p className="t-body font-[600]">{en.trace.levelUp(ramp.level)}</p> : null}
            {change === "down" ? <p className="t-body font-[600]">{en.trace.levelDown(ramp.level)}</p> : null}
            <div>
              <button type="button" className="btn btn-strong" onClick={nextScramble} aria-keyshortcuts="N">{en.trace.next}</button>
            </div>
            <SessionReport reader={reader} trainer="trace" events={events} />
          </div>
        ) : (
          <SessionReport reader={reader} trainer="trace" events={events} />
        )
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          {cubeHidden ? (
            <div className="grid aspect-square w-full max-w-[28rem] place-items-center self-center rounded-[4px] bg-stage t-meta text-quiet">{en.trace.lookFirst}</div>
          ) : (
            <Cube setup={scramble} {...(highlight === undefined ? {} : { highlight, revealOnly: true })} label={`${en.trace.scramble}: ${scramble}`} />
          )}
          <p className="t-meta text-quiet">
            {en.trace.scramble}: <span className="t-notation">{scramble}</span>
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={(reviewPosition ?? position) <= 0 || lookPhase} onClick={() => { setReview({ key: reviewKey, position: Math.max(0, (reviewPosition ?? position) - 1) }); }}>{explore.previous}</button>
            {reviewing ? <button type="button" className="btn btn-strong" onClick={() => { setReview(undefined); input.current?.focus(); }}>{explore.returnCurrent}</button> : null}
          </div>
          {reviewing && shown !== undefined ? <><p className="t-meta text-quiet">{explore.review}</p><PieceColours reader={reader} scramble={scramble} slot={shown.step.look} /><p className="t-body">{explore.reviewLetter(shown.step.letter)}</p></> : lookPhase ? (
            <>
              <p className="t-body">{en.trace.lookFirst}</p>
              <div>
                <button type="button" className="btn btn-strong" onClick={hideCube} aria-keyshortcuts="Space">{en.trace.ready}</button>
              </div>
            </>
          ) : current !== undefined ? (
            <>
              <p className="t-meta text-quiet">
                {en.lesson.pieces[current.pieceType]} · {en.lesson.buffer} <span className="t-notation">{current.buffer}</span> · {en.trace.target(position + 1, flat.length)}
              </p>
              {explanation !== undefined ? <p className="t-body" aria-live="polite">{explanation}</p> : null}
              {ramp.level === 1 ? <PieceColours reader={reader} scramble={scramble} slot={current.step.look} /> : null}
              {cubeHidden && difficulty?.relook !== false ? (
                <div>
                  <button type="button" className="btn" onClick={() => { setLooked(undefined); setRelooks((n) => n + 1); }}>{en.difficulty.lookAgain}</button>
                </div>
              ) : null}
              <form noValidate onSubmit={submit} className="flex flex-wrap items-end gap-2">
                <label htmlFor={inputId} className="flex flex-col gap-1 t-ui">
                  {mustRetype === undefined ? en.trace.target(position + 1, flat.length) : en.trace.retype(mustRetype)}
                  <input ref={input} id={inputId} autoFocus className="field w-24 text-center t-subheading casual" value={typed} maxLength={2} autoComplete="off" autoCapitalize="characters" onChange={(e) => { setTyped(e.target.value); }} />
                </label>
                <button type="submit" className="btn btn-strong">{en.trace.check}</button>
                {explanation === undefined ? (
                  <button type="button" className="btn" onClick={() => { setForceExplain(true); }} aria-keyshortcuts="E">{en.trace.explain}</button>
                ) : null}
              </form>
              {feedback !== undefined ? (
                <p className="t-body" role="status">
                  <span aria-label={feedback.ok ? en.trainer.correctMark : en.trainer.wrongMark} className="mr-2 inline-block font-[700]">{feedback.ok ? "✓" : "✗"}</span>
                  {feedback.text}
                </p>
              ) : null}
            </>
          ) : done ? (
            <p className="t-body">{voiced.traceDone[voice]()}</p>
          ) : null}
          <div className="flex flex-col gap-1">
            <span className="t-meta text-quiet">{en.trace.memo}</span>
            {traces.map((t) => {
              const letters = memoSoFar.filter((m) => m.pieceType === t.pieceType);
              return (
                <p key={t.pieceType} className="flex min-h-9 flex-wrap items-baseline gap-x-1 gap-y-2">
                  <span className="mr-2 t-meta text-quiet">{en.lesson.pieces[t.pieceType]}</span>
                  {letters.map((m, i) => (
                    <span key={`${t.pieceType}-${m.step.index}`} className={i % 2 === 1 ? "mr-3" : ""}>
                      <LetterNotch letter={m.step.letter} face={reader.faceOf(m.step.target)} />
                    </span>
                  ))}
                </p>
              );
            })}
            {done && traces.some((t) => t.parity) ? <p className="t-meta">{en.trace.parity}</p> : null}
          </div>
        </div>
      </div>
    </TrainerShell>
  );
}
