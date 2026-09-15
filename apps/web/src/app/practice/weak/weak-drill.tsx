"use client";

import { attemptsOf, weakItems, type WeakItem } from "@bld/analytics";
import { drillScramble } from "@bld/cube-engine";
import { reviewsByCase, scheduleCase } from "@bld/srs";
import type { AppEvent } from "@bld/storage";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Cube } from "@/components/cube/cube";
import { netCells } from "@/components/cube/cube-state";
import { StickerNet } from "@/components/cube/sticker-net";
import { piecesOf } from "@/components/lesson/op-demos";
import { useSettings } from "@/components/settings/settings-provider";
import { TrainerShell } from "@/components/trainer/trainer-shell";
import { en } from "@/i18n/en";
import { itemLabel, parseCase } from "@/lib/item-labels";
import { m2opData, threeStyleForReader, useMethodData } from "@/lib/methods";
import { useReader, type Reader } from "@/lib/reader";
import { newId, nowIso } from "@/lib/storage-client";
import { useEvents } from "@/lib/use-events";
import { shotCases } from "@/trainers/m2op-cases";
import { mainImage } from "@/trainers/pairs";
import { commCases } from "@/trainers/three-style";
import { useLibrary } from "../pairs/use-library";

const TRAINERS = ["trace", "pairs", "m2op", "3style"] as const;

interface Prompt {
  /** What to show before the answer. */
  readonly question: ReactNode;
  /** Typed answers are checked against this; recall items reveal and self-grade instead. */
  readonly typed?: string;
  readonly answer: ReactNode;
}

/**
 * Weak 20 (BRIEF §8): the twenty worst items across every trainer, drilled one after another. Each item
 * is asked the way its own trainer asks it, and the answer is logged under that trainer and case, so the
 * grade feeds the same FSRS schedule. The deck is fixed when the page opens.
 */
export function WeakDrill() {
  const reader = useReader();
  const { stored } = useSettings();
  const { events, append } = useEvents();
  const { pairs } = useLibrary();
  const m2op = useMethodData(reader, m2opData);
  const threeStyle = useMethodData(reader, threeStyleForReader);
  const [deck, setDeck] = useState<readonly WeakItem[] | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<boolean | undefined>(undefined);
  const [right, setRight] = useState(0);
  const shownAt = useRef(0);

  // Build the deck once, from every attempt so far; later answers don't reshuffle it mid-session.
  useEffect(() => {
    if (events === undefined || deck !== undefined) return;
    const attempts = attemptsOf(events);
    const now = new Date();
    const reviews = new Map(TRAINERS.map((t) => [t, reviewsByCase(events, t)]));
    const items = weakItems(attempts, { retrievability: (trainer, caseId) => scheduleCase(caseId, reviews.get(trainer as (typeof TRAINERS)[number])?.get(caseId) ?? [], now).retrievability });
    queueMicrotask(() => { setDeck(items); });
  }, [events, deck]);

  const item = deck?.[index];
  useEffect(() => {
    shownAt.current = performance.now();
  }, [index]);

  const prompt = useMemo((): Prompt | "unavailable" | undefined => {
    if (item === undefined || reader === undefined) return undefined;
    return promptFor(reader, item, { pairs, m2op: m2op?.ok === true ? m2op.value : undefined, threeStyle: threeStyle?.ok === true ? threeStyle.value : undefined, algOverrides: stored?.algOverrides });
  }, [item, reader, pairs, m2op, threeStyle, stored?.algOverrides]);

  const log = (correct: boolean) => {
    if (item === undefined) return;
    const event: AppEvent = { id: newId(), type: "drill.attempt", at: nowIso(), trainer: item.trainer, caseId: item.caseId, strategy: "weak20", correct, responseMs: Math.round(performance.now() - shownAt.current), detail: { from: "weak20" } };
    void append([event]);
    if (correct) setRight((n) => n + 1);
  };
  const next = () => {
    setIndex((i) => i + 1);
    setRevealed(false);
    setTyped("");
    setResult(undefined);
  };

  const shell = (children: ReactNode) => (
    <TrainerShell title={en.weak.title} intro={en.weak.intro} shortcuts={[]}>
      {children}
    </TrainerShell>
  );

  if (deck === undefined || reader === undefined) return shell(<p className="t-meta text-quiet">{en.cube.loading}</p>);
  if (deck.length === 0) return shell(<p className="t-body">{en.weak.none}</p>);
  if (item === undefined) {
    return shell(
      <div className="flex flex-col gap-3" role="status">
        <p className="t-subheading">{en.weak.done}</p>
        <p className="t-body">{en.weak.score(right, deck.length)}</p>
        <div>
          <button type="button" className="btn btn-strong" onClick={() => { setDeck(undefined); setIndex(0); setRight(0); }}>{en.weak.again}</button>
        </div>
      </div>,
    );
  }
  if (prompt === undefined) return shell(<p className="t-meta text-quiet">{en.cube.loading}</p>);

  return shell(
    <div className="flex flex-col gap-4">
      <p className="t-meta text-quiet">
        {en.weak.progress(index + 1, deck.length)} · {en.analytics.trainers[item.trainer as (typeof TRAINERS)[number]]} · {itemLabel(reader, item.trainer, item.caseId)}
      </p>
      {prompt === "unavailable" ? (
        <>
          <p className="t-body">{en.weak.unavailable}</p>
          <div>
            <button type="button" className="btn btn-strong" onClick={next}>{en.weak.next}</button>
          </div>
        </>
      ) : (
        <>
          {prompt.question}
          {prompt.typed !== undefined ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (result !== undefined) {
                  next();
                  return;
                }
                if (typed.trim() === "") return;
                const correct = typed.trim().toLocaleUpperCase() === prompt.typed?.toLocaleUpperCase();
                log(correct);
                setResult(correct);
              }}
            >
              <input className="field casual w-20 text-center text-[1.5rem]" value={typed} maxLength={2} autoFocus autoComplete="off" disabled={result !== undefined} onChange={(e) => { setTyped(e.target.value); }} aria-label={en.weak.check} />
              <button type="submit" className="btn btn-strong">{result === undefined ? en.weak.check : en.weak.next}</button>
            </form>
          ) : !revealed ? (
            <div>
              <button type="button" className="btn btn-strong" onClick={() => { setRevealed(true); }}>{en.weak.reveal}</button>
            </div>
          ) : (
            <>
              {prompt.answer}
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => { log(false); next(); }}>{en.weak.wrong}</button>
                <button type="button" className="btn btn-strong" onClick={() => { log(true); next(); }}>{en.weak.right}</button>
              </div>
            </>
          )}
          {result !== undefined ? <p className="t-body font-[600]" role="status">{result ? en.weak.correct : en.weak.notQuite(prompt.typed ?? "")}</p> : null}
        </>
      )}
    </div>,
  );
}

function promptFor(
  reader: Reader,
  item: WeakItem,
  sources: { pairs: ReturnType<typeof useLibrary>["pairs"]; m2op: Parameters<typeof shotCases>[1] | undefined; threeStyle: { corners: Parameters<typeof commCases>[1]; edges: Parameters<typeof commCases>[1] } | undefined; algOverrides: Parameters<typeof commCases>[3] },
): Prompt | "unavailable" | undefined {
  const parsed = parseCase(item.trainer, item.caseId);
  if (parsed === undefined) return "unavailable";
  switch (parsed.trainer) {
    case "trace": {
      const letter = reader.letterOf(parsed.sticker);
      const index = reader.puzzle.geometry.stickers.find((s) => reader.nameOf(s.index) === parsed.sticker)?.index;
      if (letter === undefined || index === undefined) return "unavailable";
      return {
        question: (
          <>
            <p className="t-body">{en.weak.typeLetter(parsed.sticker)}</p>
            <StickerNet cells={netCells(reader.puzzle, reader.puzzle.kpuzzle.defaultPattern())} highlight={new Set([index])} label={en.weak.typeLetter(parsed.sticker)} className="w-full max-w-[22rem]" />
          </>
        ),
        typed: letter,
        answer: null,
      };
    }
    case "pairs": {
      if (sources.pairs === undefined) return undefined;
      const image = mainImage(sources.pairs.find((p) => p.id === parsed.pair));
      if (image === undefined) return "unavailable";
      return {
        question: (
          <>
            <p className="t-display-letter casual">{parsed.pair}</p>
            <p className="t-body">{en.weak.recallImage}</p>
          </>
        ),
        answer: <p className="t-heading">{image.text}</p>,
      };
    }
    case "3style": {
      if (sources.threeStyle === undefined) return undefined;
      const dataset = sources.threeStyle[parsed.pieceType];
      if (dataset.buffer !== parsed.buffer) return "unavailable";
      const found = commCases(reader.puzzle, dataset, reader.scheme, sources.algOverrides).cases.find((c) => c.id === item.caseId);
      const alg = found?.algs[0];
      const setup = alg === undefined ? undefined : drillScramble(reader.puzzle, alg.moves);
      if (found === undefined || alg === undefined || setup?.ok !== true) return "unavailable";
      const lit = piecesOf(reader, [found.buffer, found.targets[0], found.targets[1]]);
      return {
        question: (
          <>
            <p className="t-subheading"><span className="casual">{found.letters}</span> · <span className="t-notation">{found.targets[0]} → {found.targets[1]}</span></p>
            <Cube setup={setup.value.scramble} highlight={lit} label={en.threeStyle.caseTitle(found.letters, found.targets[0], found.targets[1])} className="max-w-[22rem]" />
            <p className="t-body">{en.weak.recallComm}</p>
          </>
        ),
        answer: (
          <p className="t-notation">
            {alg.alg} <span className="t-meta text-quiet">· {alg.moves}</span>
          </p>
        ),
      };
    }
    case "m2op": {
      if (sources.m2op === undefined) return undefined;
      const found = shotCases(parsed.mode, sources.m2op, reader.scheme).find((c) => c.id === item.caseId);
      if (found === undefined) return "unavailable";
      return {
        question: (
          <>
            <p className="t-subheading">{en.m2op.target} <span className="casual">{found.letter}</span> · <span className="t-notation">{found.target}</span>{found.position === undefined ? "" : ` · ${found.position === "odd" ? en.m2op.oddPosition : en.m2op.evenPosition}`}</p>
            <p className="t-body">{en.weak.recallSetup}</p>
          </>
        ),
        answer: (
          <p className="t-notation">
            {found.setup === "" ? found.notation : `${en.m2op.setup}: ${found.setup}`}
            {found.shootAs === undefined ? "" : ` · ${en.m2op.shootAs(found.shootAs)}`}
          </p>
        ),
      };
    }
  }
}
