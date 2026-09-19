"use client";

import { trace, type TraceResult } from "@bld/cube-engine";
import { useId, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { LetterNotch, LetterTile } from "@/components/letters/letters";
import { en } from "@/i18n/en";
import { voiced } from "@/i18n/voiced";
import { useReader, type Reader } from "@/lib/reader";
import { traceSteps, type TraceStep } from "@/trainers/trace-steps";
import { useVoice } from "./use-voice";

type Mode = "show" | "guided";

export function traceFor(reader: Reader, scramble: string, pieces: "corners" | "edges", method: "op" | "m2" | "threeStyle"): TraceResult | undefined {
  const result = trace(reader.puzzle, { alg: scramble }, { pieceType: pieces, buffer: reader.buffers[method][pieces], scheme: reader.scheme, policy: { orientedInPlace: method === "threeStyle" ? "separate" : "asTargets" } });
  return result.ok ? result.value : undefined;
}

/**
 * Tracing one piece type of a scramble, one target at a time (BRIEF §6 lessons 6–8, and the core of
 * guided trace mode). The cube lights the buffer and the sticker to look at; cycle breaks and twisted
 * pieces get their own explanation.
 *
 * - `mode="show"` steps through the answers with a Next button, for a worked example.
 * - `mode="guided"` asks for each letter: a right letter moves on, a wrong one shows the answer and
 *   has to be typed before moving on (your 2026-09-15 answer).
 */
export function TraceWalk({ scramble, pieces, method = "op", mode = "guided", label }: { scramble: string; pieces: "corners" | "edges"; method?: "op" | "m2" | "threeStyle"; mode?: Mode; label: string; /** What the scramble demonstrates, checked by lessons.test.ts: no-breaks, break, twist. */ shows?: string }) {
  const reader = useReader();
  const voice = useVoice();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const traced = useMemo(() => (reader === undefined ? undefined : traceFor(reader, scramble, pieces, method)), [reader, scramble, pieces, method]);
  const steps = useMemo(() => (traced === undefined ? [] : traceSteps(traced)), [traced]);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | undefined>(undefined);
  const [mustRetype, setMustRetype] = useState<string | undefined>(undefined);

  if (reader === undefined || traced === undefined) return <p className="t-meta text-quiet">{en.cube.loading}</p>;

  const step: TraceStep | undefined = steps[index];
  const done = step === undefined;
  const bufferSticker = traced.buffer.sticker;
  const highlight = done ? [bufferSticker] : [...new Set([bufferSticker, step.look])];
  const explanation = step === undefined ? undefined : step.chosen ? (step.kind === "orientationTarget" ? voiced.traceTwist[voice]() : voiced.traceBreak[voice]()) : voiced.traceLook[voice](en.cube.faceNames[reader.faceOf(step.look)]);

  const advance = () => {
    setIndex((i) => i + 1);
    setTyped("");
    setMustRetype(undefined);
    input.current?.focus();
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (step === undefined) return;
    const answer = typed.trim().toLocaleUpperCase("en-GB");
    if (mustRetype !== undefined) {
      if (answer === mustRetype.toLocaleUpperCase("en-GB")) {
        setFeedback(undefined);
        advance();
      }
      return;
    }
    if (answer === step.letter.toLocaleUpperCase("en-GB")) {
      setFeedback({ ok: true, text: voiced.traceCorrect[voice](step.letter) });
      advance();
    } else {
      setFeedback({ ok: false, text: voiced.traceWrong[voice](step.letter, answer) });
      setMustRetype(step.letter);
      setTyped("");
    }
  };

  return (
    <div className="my-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Cube setup={scramble} highlight={highlight} label={`${label}. ${en.lesson.scramble}: ${scramble}`} />
      <div className="flex flex-col gap-4">
        <p className="t-meta text-quiet">
          {en.lesson.scramble}: <span className="t-notation">{scramble}</span>
        </p>
        <p className="t-meta text-quiet">
          {en.lesson.pieces[pieces]} · {en.lesson.buffer} <span className="t-notation">{bufferSticker}</span> ({traced.buffer.sticker === "" ? "" : reader.letterOf(bufferSticker)})
        </p>
        {done ? (
          <p className="t-body" aria-live="polite">{voiced.traceDone[voice]()}</p>
        ) : (
          <>
            <p className="t-body" aria-live="polite">{explanation}</p>
            {mode === "show" ? (
              <div className="flex items-center gap-4">
                <LetterTile letter={step.letter} face={reader.faceOf(step.target)} label={`${step.target}, ${step.letter}`} />
                <button type="button" className="btn btn-strong" onClick={advance}>
                  {en.lesson.next}
                </button>
              </div>
            ) : (
              <form noValidate onSubmit={submit} className="flex flex-wrap items-end gap-2">
                <label htmlFor={inputId} className="flex flex-col gap-1 t-ui">
                  {mustRetype === undefined ? en.lesson.typeLetter(index + 1) : en.lesson.retype(mustRetype)}
                  <input ref={input} id={inputId} className="field w-24 text-center t-subheading casual" value={typed} maxLength={2} autoComplete="off" autoCapitalize="characters" onChange={(e) => { setTyped(e.target.value); }} />
                </label>
                <button type="submit" className="btn btn-strong">{en.lesson.check}</button>
              </form>
            )}
            {feedback !== undefined ? (
              <p className="t-body" role="status">
                <span aria-hidden className="mr-2 inline-block font-[700]">{feedback.ok ? "✓" : "✗"}</span>
                {feedback.text}
              </p>
            ) : null}
          </>
        )}
        <div className="flex flex-col gap-1">
          <span className="t-meta text-quiet">{en.lesson.memoSoFar}</span>
          <p className="flex min-h-9 flex-wrap items-baseline gap-x-1 gap-y-2">
            {steps.slice(0, index).map((s, i) => (
              <span key={s.index} className={`inline-flex ${i % 2 === 1 ? "mr-3" : ""}`}>
                <LetterNotch letter={s.letter} face={reader.faceOf(s.target)} />
              </span>
            ))}
          </p>
          {done && traced.parity ? <p className="t-meta">{en.lesson.oddCount(traced.targetCount)}</p> : null}
        </div>
      </div>
    </div>
  );
}
