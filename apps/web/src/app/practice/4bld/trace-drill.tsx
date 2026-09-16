"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { netCells } from "@/components/cube/cube-state";
import { StickerNet } from "@/components/cube/sticker-net";
import { LetterNotch } from "@/components/letters/letters";
import { SessionReport } from "@/components/trainer/session-report";
import { TrainerShell } from "@/components/trainer/trainer-shell";
import { en } from "@/i18n/en";
import { stickersOfPieces, type FourBldPieces } from "@/lib/reader-4x4";
import { announcement } from "@/lib/speech";
import { newId, nowIso } from "@/lib/storage-client";
import { centreSession, FOUR_BLD_TRAINER, fourBldScramble, traceOf, type FourBldMode } from "@/trainers/four-bld";
import { lessonFor, type DrillProps } from "./four-bld-trainer";

interface Prompt {
  /** Stickers any of which is right; more than one only for x-centres. */
  readonly accepted: readonly string[];
  readonly letters: readonly string[];
  readonly isBreak: boolean;
}

interface Answered {
  readonly sticker: string;
  readonly letter: string;
}

const upper = (text: string) => text.trim().toLocaleUpperCase("en-GB");

/**
 * Tracing on a 4x4. Wings and corners have one right letter per target, from the engine's trace. X-centres
 * are walked by `centreSession`, which accepts any slot of the right colour and follows the one you chose.
 * The first try at each target is what's graded and logged; a wrong one is shown and retyped.
 */
export function TraceDrill({ reader, events, append, settings, mode, pieces, help }: DrillProps & { mode: FourBldMode; pieces: FourBldPieces; help: boolean }) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [seed] = useState(() => newId().replace(/-/g, "").slice(0, 10));
  const [index, setIndex] = useState(0);
  const scramble = useMemo(() => fourBldScramble(seed, index), [seed, index]);
  const [answered, setAnswered] = useState<readonly Answered[]>([]);
  const [firstTries, setFirstTries] = useState<readonly boolean[]>([]);
  const [typed, setTyped] = useState("");
  const [retyping, setRetyping] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | undefined>(undefined);
  const promptStart = useRef(0);

  // The x-centre session keeps its own state as answers go in; it is rebuilt for each scramble.
  const session = useMemo(() => (pieces === "xcenters" ? centreSession(reader, scramble) : undefined), [reader, scramble, pieces]);
  const result = useMemo(() => (pieces === "xcenters" ? undefined : traceOf(reader, scramble, pieces)), [reader, scramble, pieces]);

  // Every answer lengthens `answered`, so its length also marks each change in the session's state.
  const position = answered.length;
  const prompt = useMemo((): Prompt | undefined => {
    if (session !== undefined) return session.next();
    const sticker = result?.targetStickers[position];
    const letter = result?.targets[position];
    if (result === undefined || sticker === undefined || letter === undefined) return undefined;
    return { accepted: [sticker], letters: [letter], isBreak: result.cycleBreaks.includes(position) };
  }, [session, result, position]);
  const done = prompt === undefined;

  useEffect(() => {
    promptStart.current = performance.now();
  }, [position, scramble]);

  const next = useCallback(() => {
    setIndex((i) => i + 1);
    setAnswered([]);
    setFirstTries([]);
    setTyped("");
    setRetyping(false);
    setFeedback(undefined);
    input.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!done || event.target instanceof HTMLInputElement) return;
      if (event.key === "n" || event.key === "N" || event.key === "Enter") {
        event.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [done, next]);

  /** Takes a right answer: the session swaps the slot in, and the memo grows. */
  const accept = (letter: string, sticker: string) => {
    if (session !== undefined) session.answer(letter);
    setAnswered((a) => [...a, { sticker, letter }]);
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (prompt === undefined) return;
    const answer = upper(typed);
    const at = prompt.letters.findIndex((l) => upper(l) === answer);
    const sticker = prompt.accepted[at];
    const letter = prompt.letters[at] ?? answer;
    setTyped("");
    if (retyping) {
      if (sticker === undefined) return;
      setRetyping(false);
      setFeedback(undefined);
      accept(letter, sticker);
      return;
    }
    const correct = sticker !== undefined;
    const responseMs = Math.round(performance.now() - promptStart.current);
    setFirstTries((f) => [...f, correct]);
    void append([
      {
        id: newId(),
        type: "drill.attempt",
        at: nowIso(),
        trainer: FOUR_BLD_TRAINER,
        caseId: `trace-${pieces}:${sticker ?? prompt.accepted[0] ?? ""}`,
        seed,
        correct,
        responseMs,
        detail: { mode, pieceType: pieces, scramble, scrambleIndex: index, index: position, typed: answer, letters: prompt.letters.join(" "), kind: prompt.isBreak ? "break" : position === 0 ? "first" : "normal" },
      },
    ]);
    const choices = prompt.letters.join(", ");
    if (correct) {
      setFeedback({ ok: true, text: `${en.fourBld.right(letter)}${prompt.letters.length > 1 ? ` ${en.fourBld.anyOf(choices)}` : ""}` });
      accept(letter, sticker);
    } else {
      setFeedback({ ok: false, text: en.fourBld.wrong(prompt.letters.length > 1 ? en.fourBld.anyOf(choices) : `${en.fourBld.retype(choices)}.`) });
      setRetyping(true);
    }
  };

  // With help on, light the buffer, where the next piece is read, and every slot that would be right.
  // The 3D cube can only light x-centres a whole colour at a time (D-040), so for them a flat net lights the slots.
  const buffer = reader.buffers[pieces];
  const look = answered.at(-1)?.sticker ?? buffer;
  const lit = useMemo(() => (help && prompt !== undefined ? stickersOfPieces(reader, [buffer, look, ...prompt.accepted]) : undefined), [help, prompt, reader, buffer, look]);
  const highlight = pieces === "xcenters" ? undefined : lit;
  const netLit = useMemo(() => (pieces === "xcenters" && lit !== undefined ? new Set(reader.puzzle.geometry.stickers.filter((s) => lit.includes(reader.nameOf(s.index))).map((s) => s.index)) : undefined), [pieces, lit, reader]);
  const cells = useMemo(() => netCells(reader.puzzle, reader.puzzle.kpuzzle.defaultPattern().applyAlg(scramble)), [reader, scramble]);
  const right = firstTries.filter(Boolean).length;
  const finished = firstTries.length === 0 ? en.fourBld.solvedAlready : en.fourBld.done(right, firstTries.length);

  const announce =
    prompt === undefined ? finished : announcement([en.fourBld.target(position + 1), prompt.isBreak ? en.fourBld.breakNote : undefined, feedback?.text]);

  return (
    <TrainerShell
      title={en.fourBld.title}
      intro={en.fourBld.intro}
      lesson={lessonFor(mode)}
      settings={settings}
      shortcuts={[
        { keys: en.fourBld.keyEnter, action: en.fourBld.keyEnterAction },
        { keys: en.fourBld.keyN, action: en.fourBld.keyNAction },
      ]}
      announce={announce}
      summary={<SessionReport reader={reader} trainer={FOUR_BLD_TRAINER} events={events} />}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <Cube puzzleId="4x4x4" setup={scramble} {...(highlight === undefined ? {} : { highlight })} label={en.fourBld.scrambleLabel(scramble)} />
          <p className="t-meta text-quiet">
            {en.fourBld.scramble}: <span className="t-notation">{scramble}</span>
          </p>
          {netLit !== undefined ? (
            <div className="flex flex-col gap-1">
              <span className="t-meta text-quiet">{en.fourBld.netHelp}</span>
              <StickerNet cells={cells} size={4} highlight={netLit} label={en.fourBld.netHelpLabel(prompt?.letters.join(", ") ?? "")} className="w-full max-w-[22rem]" />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <p className="t-meta text-quiet">
            {en.fourBld.pieces[pieces]} · {en.lesson.buffer} <span className="t-notation">{buffer}</span>
          </p>
          {prompt !== undefined ? (
            <>
              {prompt.isBreak ? <p className="t-body">{en.fourBld.breakNote}</p> : pieces === "xcenters" && prompt.accepted.length > 1 && position === 0 ? <p className="t-body">{en.fourBld.choiceNote}</p> : null}
              <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
                <label htmlFor={inputId} className="flex flex-col gap-1 t-ui">
                  {retyping ? en.fourBld.retype(prompt.letters.join(" / ")) : en.fourBld.target(position + 1)}
                  <input ref={input} id={inputId} autoFocus className="field w-24 text-center t-subheading casual" value={typed} maxLength={1} autoComplete="off" autoCapitalize="characters" onChange={(e) => { setTyped(e.target.value); }} />
                </label>
                <button type="submit" className="btn btn-strong">{en.fourBld.check}</button>
              </form>
            </>
          ) : (
            <div className="flex flex-col gap-2" role="status">
              <p className="t-body">{finished}</p>
              {result !== undefined && firstTries.length > 0 ? <p className="t-body">{result.parity ? (pieces === "wings" ? en.fourBld.parityOdd : en.fourBld.parityOddCorners) : en.fourBld.parityEven}</p> : null}
              <div>
                <button type="button" className="btn btn-strong" onClick={next} aria-keyshortcuts="N">{en.fourBld.next}</button>
              </div>
            </div>
          )}
          {feedback !== undefined ? (
            <p className="t-body" role="status">
              <span aria-label={feedback.ok ? en.trainer.correctMark : en.trainer.wrongMark} className="mr-2 inline-block font-[700]">{feedback.ok ? "✓" : "✗"}</span>
              {feedback.text}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <span className="t-meta text-quiet">{en.fourBld.memo}</span>
            <p className="flex min-h-9 flex-wrap items-baseline gap-x-1 gap-y-2">
              {answered.map((a, i) => (
                <span key={`${String(i)}-${a.sticker}`} className={i % 2 === 1 ? "mr-3" : ""}>
                  <LetterNotch letter={a.letter} face={reader.faceOf(a.sticker)} />
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    </TrainerShell>
  );
}
