"use client";

import { createRng, type Rng } from "@bld/cube-engine";
import { dueCases } from "@bld/srs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { DifficultySummary } from "@/components/trainer/difficulty-summary";
import { Segmented } from "@/components/trainer/trainer-shell";
import { en } from "@/i18n/en";
import { polish } from "@/i18n/polish";
import { speak as readText, useSpeechAvailable } from "@/lib/speech";
import { newId, nowIso } from "@/lib/storage-client";
import { readPreference, writePreference } from "@/lib/use-events";
import { drillWeights, isPlaceholder, mainImage, PAIRS_TRAINER, pairsForWord, pickWeighted, samePair } from "@/trainers/pairs";
import { BigPair, ignoreKey, lettersOf, type LibraryContext } from "./pair-ui";

export type DrillMode = "pair-image" | "image-pair" | "rapid" | "audio";
const DRILL_MODES: readonly DrillMode[] = ["pair-image", "image-pair", "rapid", "audio"];
const RAPID_SECONDS = [2, 3, 5] as const;
type RapidSeconds = (typeof RAPID_SECONDS)[number];
const isDrillMode = (v: unknown): v is DrillMode => typeof v === "string" && (DRILL_MODES as readonly string[]).includes(v);
const isRapid = (v: unknown): v is RapidSeconds => typeof v === "number" && (RAPID_SECONDS as readonly number[]).includes(v);

function logAttempt(ctx: LibraryContext, caseId: string, correct: boolean, responseMs: number, detail: Record<string, string | number | boolean>, strategy: string, seed?: string) {
  void ctx.append([{ id: newId(), type: "drill.attempt", at: nowIso(), trainer: PAIRS_TRAINER, caseId, strategy, ...(seed === undefined ? {} : { seed }), correct, responseMs: Math.round(responseMs), detail }]);
}

function speak(id: string, onError?: () => void) {
  readText(lettersOf(id).join(" "), onError);
}

/**
 * Recall a pair's image, reveal it, and mark yourself. With `limitSeconds` (rapid fire) an unanswered
 * card reveals itself when time runs out and counts as missed. With `audio` the pair is read aloud
 * instead of shown.
 */
function RecallCard({ ctx, id, limitSeconds, audio, onGraded }: { ctx: LibraryContext; id: string; limitSeconds?: number; audio?: boolean; onGraded: (correct: boolean, responseMs: number) => void }) {
  const voiceAvailable = useSpeechAvailable();
  const [audioFailed, setAudioFailed] = useState(false);
  const pair = ctx.byId.get(id);
  const main = mainImage(pair);
  const alternates = (pair?.images ?? []).filter((i) => i !== main && !isPlaceholder(i)).map((i) => i.text);
  const [revealed, setRevealed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [left, setLeft] = useState(limitSeconds ?? 0);
  const shownAt = useRef(0);
  const revealMs = useRef(0);

  useEffect(() => {
    shownAt.current = performance.now();
    if (audio === true && voiceAvailable) speak(id, () => { setAudioFailed(true); });
    if (limitSeconds === undefined) return;
    const timer = window.setInterval(() => {
      const remaining = limitSeconds - (performance.now() - shownAt.current) / 1000;
      if (remaining > 0) { setLeft(remaining); return; }
      window.clearInterval(timer);
      setLeft(0);
      setTimedOut(true);
      setRevealed((was) => {
        if (!was) revealMs.current = limitSeconds * 1000;
        return true;
      });
    }, 100);
    return () => {
      window.clearInterval(timer);
    };
  }, [id, audio, limitSeconds, voiceAvailable]);

  const reveal = useCallback(() => {
    if (revealed) return;
    revealMs.current = performance.now() - shownAt.current;
    setRevealed(true);
  }, [revealed]);

  const grade = useCallback(
    (correct: boolean) => {
      if (!revealed) return;
      onGraded(timedOut ? false : correct, revealMs.current);
    },
    [revealed, timedOut, onGraded],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (ignoreKey(event)) return;
      if (event.key === " ") {
        event.preventDefault();
        if (revealed && timedOut) grade(false);
        else reveal();
      } else if (event.key === "Enter" && revealed && timedOut) grade(false);
      else if (event.key === "j" || event.key === "J" || event.key === "ArrowRight") grade(true);
      else if (event.key === "f" || event.key === "F" || event.key === "ArrowLeft") grade(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [reveal, grade, revealed, timedOut]);

  return (
    <div className="flex flex-col items-start gap-4">
      {audio === true && voiceAvailable && !audioFailed ? (
        <button type="button" className="btn" onClick={() => { speak(id, () => { setAudioFailed(true); }); }}>{en.pairs.listen}</button>
      ) : (
        <BigPair id={id} />
      )}
      {audio === true && (!voiceAvailable || audioFailed) ? <p role="status" className="t-meta text-quiet">{audioFailed ? polish.speech.failed : polish.speech.missing}</p> : null}
      {limitSeconds !== undefined && !revealed ? (
        <p className="t-meta" aria-live="off">{en.pairs.rapidLeft(left)}</p>
      ) : null}
      {!revealed ? (
        <button type="button" className="btn btn-strong" onClick={reveal} aria-keyshortcuts="Space">{en.pairs.showImage}</button>
      ) : (
        <div className="flex flex-col gap-3" role="status">
          {audio === true ? <BigPair id={id} /> : null}
          <p className="t-heading">{main?.text}</p>
          {alternates.length > 0 ? <p className="t-meta text-quiet">{en.pairs.alternates}: {alternates.join(", ")}</p> : null}
          {timedOut ? (
            <>
              <p className="t-body">{en.pairs.timeUp}</p>
              <div>
                <button type="button" className="btn btn-strong" onClick={() => { grade(false); }}>{en.pairs.next}</button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => { grade(false); }} aria-keyshortcuts="F">{en.pairs.iDidNot}</button>
              <button type="button" className="btn btn-strong" onClick={() => { grade(true); }} aria-keyshortcuts="J">{en.pairs.iKnew}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Image → pair: the main image is shown and you type its pair. Any pair that uses the word is right. */
function TypedCard({ ctx, id, onLogged, onNext }: { ctx: LibraryContext; id: string; onLogged: (correct: boolean, responseMs: number) => void; onNext: () => void }) {
  const word = mainImage(ctx.byId.get(id))?.text ?? "";
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<{ correct: boolean; accepted: string[] } | undefined>(undefined);
  const shownAt = useRef(0);
  const next = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    shownAt.current = performance.now();
  }, [id]);
  useEffect(() => {
    if (result !== undefined) next.current?.focus();
  }, [result]);

  return (
    <div className="flex flex-col items-start gap-4">
      <p className="t-title">{word}</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (result !== undefined || typed.trim() === "") return;
          const accepted = pairsForWord(ctx.pairs, word);
          const correct = accepted.some((p) => samePair(typed, p));
          setResult({ correct, accepted });
          onLogged(correct, performance.now() - shownAt.current);
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="t-meta text-quiet">{en.pairs.typePair}</span>
          <input className="field mono w-28 text-[1.25rem] uppercase" value={typed} maxLength={8} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus disabled={result !== undefined} onChange={(e) => { setTyped(e.target.value); }} />
        </label>
        {result === undefined ? <button type="submit" className="btn btn-strong self-end">{en.pairs.check}</button> : null}
      </form>
      {result !== undefined ? (
        <div className="flex flex-col gap-2" role="status">
          <p className="t-body font-[600]">{result.correct ? en.pairs.correct : en.pairs.notQuite(id)}</p>
          {result.accepted.length > 1 ? <p className="t-meta text-quiet">{en.pairs.alsoAccepted(result.accepted.join(", "))}</p> : null}
          <div>
            <button ref={next} type="button" className="btn btn-strong" onClick={onNext}>{en.pairs.next}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Today's review queue: pairs whose FSRS card is due, most overdue first. */
export function PairReview({ ctx }: { ctx: LibraryContext }) {
  // Graded this session: kept out of the queue even before the new attempt reaches the schedules.
  const [graded, setGraded] = useState<readonly string[]>([]);
  const due = useMemo(() => dueCases(ctx.schedules, ctx.now).filter((id) => mainImage(ctx.byId.get(id)) !== undefined && !graded.includes(id)), [ctx.schedules, ctx.now, ctx.byId, graded]);
  const current = due[0];
  return (
    <div className="flex flex-col gap-4">
      <p className="t-meta">{due.length === 0 ? en.pairs.noneDue : en.pairs.due(due.length)}</p>
      {current !== undefined ? (
        <RecallCard
          key={current}
          ctx={ctx}
          id={current}
          onGraded={(correct, ms) => {
            logAttempt(ctx, current, correct, ms, { mode: "review" }, "spaced");
            setGraded((g) => [...g, current]);
          }}
        />
      ) : null}
    </div>
  );
}

/** Drill every pair that has an image, weighted towards weak and common pairs. */
export function PairDrill({ ctx }: { ctx: LibraryContext }) {
  const [mode, setMode] = useState<DrillMode>(() => readPreference("bld.pairs.drill", "pair-image", isDrillMode));
  const [rapid, setRapid] = useState<RapidSeconds>(() => readPreference("bld.pairs.rapid", 3, isRapid));
  const [sessionSeed] = useState(() => newId());
  const { stored } = useSettings();
  // The difficulty settings' seed replays the same drill order; rapid fire is this drill's own time pressure.
  const seed = stored?.difficulty?.seed ?? sessionSeed;
  const rng = useRef<Rng | undefined>(undefined);
  const recent = useRef<string[]>([]);
  const [current, setCurrent] = useState<string | undefined>(undefined);
  const [count, setCount] = useState(0);
  const candidates = useMemo(() => ctx.pairs.filter((p) => mainImage(p) !== undefined).map((p) => p.id).sort(), [ctx.pairs]);
  const speechAvailable = typeof window !== "undefined" && "speechSynthesis" in window;

  const pick = useCallback(() => {
    rng.current ??= createRng(seed);
    const next = pickWeighted(candidates, drillWeights(candidates, ctx.schedules, ctx.expected), rng.current, recent.current);
    if (next !== undefined) recent.current = [...recent.current.slice(-20), next];
    setCurrent(next);
    setCount((n) => n + 1);
  }, [candidates, ctx.schedules, ctx.expected, seed]);

  const hasCurrent = current !== undefined && candidates.includes(current);
  useEffect(() => {
    if (!hasCurrent && candidates.length > 0) pick();
  }, [hasCurrent, candidates.length, pick]);

  const graded = (correct: boolean, ms: number) => {
    if (current === undefined) return;
    logAttempt(ctx, current, correct, ms, { mode, ...(mode === "rapid" ? { limitSeconds: rapid } : {}) }, "weakness", seed);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Segmented<DrillMode> label={en.pairs.tabs.drill} options={DRILL_MODES} labels={en.pairs.drillModes} value={mode} onChange={(v) => { setMode(v); writePreference("bld.pairs.drill", v); pick(); }} />
        <DifficultySummary seed />
        {mode === "rapid" ? (
          <Segmented<`${RapidSeconds}`> label={en.pairs.rapidTime} options={RAPID_SECONDS.map((s) => String(s) as `${RapidSeconds}`)} labels={{ "2": en.pairs.time(2), "3": en.pairs.time(3), "5": en.pairs.time(5) }} value={String(rapid) as `${RapidSeconds}`} onChange={(v) => { const s = Number(v) as RapidSeconds; setRapid(s); writePreference("bld.pairs.rapid", s); }} />
        ) : null}
      </div>
      {candidates.length === 0 ? <p className="t-body">{en.pairs.noImages}</p> : null}
      {mode === "audio" && !speechAvailable ? <p className="t-body">{en.pairs.speechUnavailable}</p> : null}
      {current !== undefined && !(mode === "audio" && !speechAvailable) ? (
        mode === "image-pair" ? (
          <TypedCard key={`${current}-${String(count)}`} ctx={ctx} id={current} onLogged={graded} onNext={pick} />
        ) : (
          <RecallCard
            key={`${current}-${String(count)}-${mode}`}
            ctx={ctx}
            id={current}
            audio={mode === "audio"}
            {...(mode === "rapid" ? { limitSeconds: rapid } : {})}
            onGraded={(correct, ms) => {
              graded(correct, ms);
              pick();
            }}
          />
        )
      ) : null}
    </div>
  );
}
