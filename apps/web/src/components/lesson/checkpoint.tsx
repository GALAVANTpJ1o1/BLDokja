"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type SyntheticEvent, type ReactNode } from "react";
import { Cube } from "@/components/cube/cube";
import { netCells } from "@/components/cube/cube-state";
import { StickerNet } from "@/components/cube/sticker-net";
import { LetterStar } from "@/components/letters/letters";
import { algDatasets } from "@/content/algs";
import { en } from "@/i18n/en";
import { voiced } from "@/i18n/voiced";
import { useReader, type Reader } from "@/lib/reader";
import { newId, nowIso } from "@/lib/ids";
import { loadStorage } from "@/lib/storage-lazy";
import { checkpointRng, gradeLetters, gradeSetup, letterItems, parityItems, setupItems, traceItems, type CheckpointItem, type PieceKind, type TraceRequirement } from "@/trainers/checkpoint-items";
import { LessonMetaContext } from "./lesson-meta";
import { useVoice } from "./use-voice";

type Kind = "letters" | "trace" | "parity" | "setup" | "quiz";

interface QuizRegistry {
  readonly report: (id: string, correct: boolean) => void;
  readonly revealed: boolean;
}
const QuizContext = createContext<QuizRegistry | undefined>(undefined);

function generate(reader: Reader, kind: Exclude<Kind, "quiz">, seed: { lesson: string; checkpoint: string; attempt: number }, options: { pieces: PieceKind[]; count: number; requires: TraceRequirement; maxTargets: number }): CheckpointItem[] {
  const ctx = { puzzle: reader.puzzle, scheme: reader.scheme, buffers: reader.buffers.op };
  const rng = checkpointRng(seed.lesson, seed.checkpoint, seed.attempt);
  if (kind === "letters") return letterItems(ctx, rng, options.pieces, options.count);
  if (kind === "trace") return traceItems(ctx, rng, options.pieces, options.count, options.requires, options.maxTargets);
  if (kind === "parity") return parityItems(ctx, rng, options.count);
  const { opCorners, opEdges } = algDatasets();
  return setupItems(ctx, rng, options.pieces[0] === "edges" ? opEdges : opCorners, options.count);
}

function ItemPrompt({ item, reader }: { item: CheckpointItem; reader: Reader }) {
  if (item.kind === "letter") {
    const cells = netCells(reader.puzzle, reader.puzzle.kpuzzle.defaultPattern());
    const index = reader.puzzle.geometry.stickers.findIndex((s) => reader.nameOf(s.index) === item.sticker);
    return <StickerNet cells={cells} highlight={new Set([index])} label={en.lesson.whichLetterLabel} className="w-full max-w-[22rem]" />;
  }
  if (item.kind === "setup") {
    return (
      <p className="t-body">
        {en.lesson.setupPrompt(en.lesson.pieces[item.pieceType], item.target, item.letter)}
      </p>
    );
  }
  return <Cube setup={item.scramble} label={`${en.lesson.scramble}: ${item.scramble}`} className="max-w-[20rem]" />;
}

function questionFor(item: CheckpointItem): string {
  switch (item.kind) {
    case "letter":
      return en.lesson.whichLetter;
    case "trace":
      return en.lesson.traceAll(en.lesson.pieces[item.pieceType], item.buffer);
    case "parity":
      return en.lesson.parityQuestion;
    case "setup":
      return en.lesson.typeSetup;
  }
}

/**
 * A lesson checkpoint (BRIEF §6): a short drill that must be passed. Generated kinds draw fresh,
 * engine-checked items for every attempt; `kind="quiz"` wraps <Question> blocks written in the lesson.
 * Passing records `lesson.checkpointPassed`, which marks the lesson done on the path.
 */
export function Checkpoint({ id, kind, count = "8", pieces = "corners edges", requires = "any", maxTargets = "8", children }: { id: string; kind: Kind; count?: string; pieces?: string; requires?: string; maxTargets?: string; children?: ReactNode }) {
  const reader = useReader();
  const voice = useVoice();
  const meta = useContext(LessonMetaContext);
  const lessonId = meta?.lessonId ?? "unknown";
  const pass = meta?.checkpoints.find((c) => c.id === id)?.pass ?? 0.8;
  const title = meta?.checkpoints.find((c) => c.id === id)?.title ?? id;
  const inputId = useId();
  const [attempt, setAttempt] = useState(0);
  const [position, setPosition] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [typed, setTyped] = useState("");
  const [last, setLast] = useState<{ ok: boolean; answer: string } | undefined>(undefined);
  const [quiz, setQuiz] = useState<Record<string, boolean>>({});
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const options = useMemo(() => ({ pieces: pieces.split(/\s+/).filter((p): p is PieceKind => p === "corners" || p === "edges"), count: Number(count), requires: requires as TraceRequirement, maxTargets: Number(maxTargets) }), [pieces, count, requires, maxTargets]);
  const items = useMemo(() => (reader === undefined || kind === "quiz" ? [] : generate(reader, kind, { lesson: lessonId, checkpoint: id, attempt }, options)), [reader, kind, lessonId, id, attempt, options]);

  const total = kind === "quiz" ? Object.keys(quiz).length : items.length;
  const correct = kind === "quiz" ? Object.values(quiz).filter(Boolean).length : results.filter(Boolean).length;
  const finished = kind === "quiz" ? quizRevealed : total > 0 && results.length === total;
  const passed = finished && total > 0 && correct / total >= pass;

  useEffect(() => {
    if (!passed || recorded) return;
    void loadStorage()
      .then((storage) => storage.appendEvents([{ id: newId(), type: "lesson.checkpointPassed", at: nowIso(), lessonId, checkpointId: id, score: { correct, total } }]))
      .then(() => {
        setRecorded(true);
        window.dispatchEvent(new CustomEvent("bld:progress"));
      });
  }, [passed, recorded, lessonId, id, correct, total]);

  const report = useCallback((questionId: string, ok: boolean) => {
    setQuiz((q) => ({ ...q, [questionId]: ok }));
  }, []);

  const restart = () => {
    setAttempt((a) => a + 1);
    setPosition(0);
    setResults([]);
    setTyped("");
    setLast(undefined);
    setQuiz({});
    setQuizRevealed(false);
    setRecorded(false);
  };

  const item = items[position];
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (reader === undefined || item === undefined) return;
    let ok: boolean;
    let answer: string;
    if (item.kind === "letter") [ok, answer] = [gradeLetters(item.answer, typed), item.answer];
    else if (item.kind === "trace") [ok, answer] = [gradeLetters(item.answer, typed), item.answer.join(" ")];
    else if (item.kind === "parity") [ok, answer] = [(typed === "yes") === item.answer, item.answer ? en.lesson.yes : en.lesson.no];
    else {
      const { opCorners, opEdges } = algDatasets();
      const dataset = item.pieceType === "corners" ? opCorners : opEdges;
      ok = gradeSetup(reader.puzzle, dataset, item.target, typed).correct;
      answer = dataset.records.find((r) => r.target === item.target)?.setup ?? "";
    }
    setResults((r) => [...r, ok]);
    setLast({ ok, answer });
    setTyped("");
    setPosition((p) => p + 1);
  };

  const scoreText = `${correct} / ${total}`;
  const neededText = `${Math.ceil(pass * total)} / ${total}`;

  return (
    <section className="my-8 flex flex-col gap-4 border-t-2 border-text pt-5" aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`} className="t-heading">
        {en.lesson.checkpoint}: {title}
      </h2>
      {reader === undefined ? <p className="t-meta text-quiet">{en.cube.loading}</p> : null}

      {kind === "quiz" ? (
        <QuizContext.Provider value={{ report, revealed: quizRevealed }}>
          <div className="flex flex-col gap-5">{children}</div>
          {!quizRevealed ? (
            <div>
              <button type="button" className="btn btn-strong" onClick={() => { setQuizRevealed(true); }}>{en.lesson.checkAnswers}</button>
            </div>
          ) : null}
        </QuizContext.Provider>
      ) : reader !== undefined && item !== undefined && !finished ? (
        <div className="flex flex-col gap-3">
          <p className="t-meta text-quiet">{en.lesson.itemOf(position + 1, items.length)}</p>
          <p className="t-body">{questionFor(item)}</p>
          <ItemPrompt item={item} reader={reader} />
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            {item.kind === "parity" ? (
              <fieldset className="flex gap-2">
                <legend className="sr-only">{en.lesson.parityQuestion}</legend>
                {(["yes", "no"] as const).map((v) => (
                  <label key={v} className={`btn ${typed === v ? "btn-strong" : ""}`}>
                    <input type="radio" name={inputId} value={v} checked={typed === v} onChange={() => { setTyped(v); }} className="sr-only" />
                    {en.lesson[v]}
                  </label>
                ))}
              </fieldset>
            ) : (
              <label htmlFor={inputId} className="flex flex-col gap-1 t-ui">
                {item.kind === "setup" ? en.lesson.setupInput : en.lesson.lettersInput}
                <input id={inputId} className={`field ${item.kind === "letter" ? "w-24 text-center casual t-subheading" : "w-64 mono"}`} value={typed} autoComplete="off" onChange={(e) => { setTyped(e.target.value); }} />
              </label>
            )}
            <button type="submit" className="btn btn-strong" disabled={typed.trim() === ""}>{en.lesson.check}</button>
          </form>
        </div>
      ) : null}

      {last !== undefined && !finished ? (
        <p className="t-body" role="status">
          <span aria-hidden className="mr-2 font-[700]">{last.ok ? "✓" : "✗"}</span>
          {last.ok ? en.lesson.itemRight : en.lesson.itemWrong(last.answer)}
        </p>
      ) : null}

      {finished ? (
        <div className="flex flex-wrap items-center gap-4" role="status">
          {passed ? <LetterStar letter="✓" label={en.lesson.passedMark} /> : null}
          <p className="t-body">{passed ? voiced.checkpointPassed[voice](scoreText) : voiced.checkpointFailed[voice](scoreText, neededText)}</p>
          <button type="button" className="btn" onClick={restart}>{passed ? en.lesson.practiseAgain : en.lesson.tryAgain}</button>
        </div>
      ) : null}
    </section>
  );
}

/** One multiple-choice question inside `<Checkpoint kind="quiz">`. */
export function Question({ id, prompt, answer, children }: { id: string; prompt: string; answer: string; children: ReactNode }) {
  const quiz = useContext(QuizContext);
  const name = useId();
  const [choice, setChoice] = useState<string | undefined>(undefined);
  const report = quiz?.report;
  useEffect(() => {
    report?.(id, choice === answer);
  }, [report, id, choice, answer]);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="t-body font-[600]">{prompt}</legend>
      <OptionContext.Provider value={{ name, choice, setChoice, answer, revealed: quiz?.revealed ?? false }}>
        <div className="flex flex-col gap-2">{children}</div>
      </OptionContext.Provider>
    </fieldset>
  );
}

const OptionContext = createContext<{ name: string; choice: string | undefined; setChoice: (v: string) => void; answer: string; revealed: boolean } | undefined>(undefined);

export function Option({ id, children }: { id: string; children: ReactNode }) {
  const ctx = useContext(OptionContext);
  if (ctx === undefined) return null;
  const selected = ctx.choice === id;
  const mark = ctx.revealed ? (id === ctx.answer ? "✓" : selected ? "✗" : "") : "";
  return (
    <label className={`flex min-h-11 items-center gap-3 rounded-[4px] border px-3 py-2 ${selected ? "border-text" : "border-rule"}`}>
      <input type="radio" name={ctx.name} value={id} checked={selected} disabled={ctx.revealed} onChange={() => { ctx.setChoice(id); }} />
      <span className="t-body">{children}</span>
      {mark !== "" ? <span className="ml-auto font-[700]" aria-label={mark === "✓" ? en.lesson.rightAnswer : en.lesson.yourWrongAnswer}>{mark}</span> : null}
    </label>
  );
}
