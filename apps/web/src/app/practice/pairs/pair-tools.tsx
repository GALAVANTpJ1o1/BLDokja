"use client";

import { useMemo, useState } from "react";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";
import { newId, nowIso } from "@/lib/storage-client";
import { readPreference, writePreference } from "@/lib/use-events";
import { addImage, applyMatches, csvRows, didYouMean, emptyPair, findImages, libraryToCsv, mainImage, mergeCsvRows, renameOrMerge, sentenceMemo, withDetails, type CsvProblem, type LibraryHealth } from "@/trainers/pairs";
import { BigPair, lettersOf, type LibraryContext } from "./pair-ui";

/**
 * "Type the first word that comes to mind" (AUDIT §6, Q4): pairs with no word first, most seen in your
 * traces, then every other pair for alternates. Each word found is logged as a `pairs.discovered` event,
 * never as a drill attempt, and a new image starts with no uses.
 */
export function PairDiscover({ ctx, health }: { ctx: LibraryContext; health: LibraryHealth }) {
  const [handled, setHandled] = useState<readonly string[]>([]);
  const [word, setWord] = useState("");
  const [confirming, setConfirming] = useState<{ suggestion: string; usedBy: string[] } | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const queue = useMemo(() => {
    const all = ctx.letters.flatMap((a) => ctx.letters.map((b) => `${a}${b}`));
    return [...new Set([...health.missing.map((m) => m.id), ...all])].filter((id) => !handled.includes(id));
  }, [ctx.letters, health.missing, handled]);
  const current = queue[0];
  const gapsLeft = health.missing.some((m) => !handled.includes(m.id));

  const next = () => {
    if (current !== undefined) setHandled((h) => [...h, current]);
    setWord("");
    setConfirming(undefined);
  };

  const add = async (text: string) => {
    if (current === undefined || text.trim() === "") return;
    const [first, second] = lettersOf(current);
    const at = nowIso();
    const result = addImage(ctx.byId.get(current) ?? emptyPair(first, second, at), text, newId(), at);
    if (result.added && !(await ctx.save([result.pair]))) {
      setMessage(en.pairs.saveFailed);
      return;
    }
    await ctx.append([{ id: newId(), type: "pairs.discovered", at, pairId: current, word: text.trim(), added: result.added }]);
    setMessage(result.added ? en.pairs.discoverLogged(text.trim(), current) : en.pairs.discoverAlready(text.trim(), current));
    next();
  };

  if (current === undefined) return <p className="t-body">{en.pairs.discoverAllFilled}</p>;
  const existing = mainImage(ctx.byId.get(current));

  return (
    <div className="flex flex-col items-start gap-4">
      {!gapsLeft ? <p className="t-meta text-quiet">{en.pairs.discoverAllFilled}</p> : null}
      <BigPair id={current} />
      {existing !== undefined ? <p className="t-meta text-quiet">{en.pairs.alternates}: {ctx.byId.get(current)?.images.map((i) => i.text).join(", ")}</p> : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const suggestion = didYouMean(word, ctx.pairs);
          if (suggestion !== undefined && confirming === undefined) { setConfirming(suggestion); return; }
          void add(word);
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="t-meta text-quiet">{en.pairs.discoverPrompt}</span>
          <input className="field" value={word} autoFocus autoComplete="off" onChange={(e) => { setWord(e.target.value); setConfirming(undefined); }} />
        </label>
        <button type="submit" className="btn btn-strong" disabled={word.trim() === ""}>{en.pairs.discoverAdd}</button>
        <button type="button" className="btn" onClick={next}>{en.pairs.discoverSkip}</button>
      </form>
      {confirming !== undefined ? (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <span className="t-meta">{en.pairs.didYouMean(confirming.suggestion, confirming.usedBy.join(", "))}</span>
          <button type="button" className="btn min-h-10 px-2" onClick={() => { void add(confirming.suggestion); }}>{en.pairs.useSuggestion(confirming.suggestion)}</button>
          <button type="button" className="btn min-h-10 px-2" onClick={() => { void add(word); }}>{en.pairs.discoverAddAnyway}</button>
        </div>
      ) : null}
      {message !== undefined ? <p className="t-meta" role="status">{message}</p> : null}
    </div>
  );
}

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-rule pt-4">
      <h2 className="t-subheading">
        {title} <span className="t-meta text-quiet">({count})</span>
      </h2>
      {count === 0 ? <p className="t-meta text-quiet">{en.pairs.healthNone}</p> : children}
    </section>
  );
}

/** Library health (AUDIT §5, item 3): the gap finder plus the quality checks your library actually needs. */
export function PairHealth({ ctx, health }: { ctx: LibraryContext; health: LibraryHealth }) {
  const [showAllMissing, setShowAllMissing] = useState(false);
  const [dismissed, setDismissed] = useState<readonly string[]>(() => readPreference("bld.pairs.dismissed", [], isStringList));
  const [message, setMessage] = useState<string | undefined>(undefined);
  const outside = ctx.pairs.filter((p) => !ctx.letters.includes(p.first) || !ctx.letters.includes(p.second)).map((p) => p.id).sort();
  const suggestions = health.suggestions.filter((s) => !dismissed.includes(`${s.imageId}>${s.suggestion}`));
  const missing = showAllMissing ? health.missing : health.missing.slice(0, 48);
  const open = (id: string) => (
    <button type="button" className="btn min-h-10 px-2 mono" onClick={() => { ctx.openEditor(id); }}>
      {id}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {message !== undefined ? <p className="t-meta" role="status">{message}</p> : null}
      <Section title={en.pairs.healthMissing} count={health.missing.length}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
          {missing.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              {open(m.id)}
              <span className="t-meta text-quiet">{m.seen > 0 ? en.pairs.seenTimes(m.seen) : m.id[0] === m.id[1] && m.expected === 0 ? "" : en.pairs.expected(m.expected)}</span>
            </li>
          ))}
        </ul>
        {!showAllMissing && health.missing.length > missing.length ? (
          <div>
            <button type="button" className="btn" onClick={() => { setShowAllMissing(true); }}>{en.pairs.showAll(health.missing.length)}</button>
          </div>
        ) : null}
      </Section>
      <Section title={en.pairs.healthPlaceholders} count={health.placeholders.length}>
        <ul className="flex flex-wrap gap-3">
          {health.placeholders.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              {open(p.id)}
              <span className="t-meta text-quiet">{p.texts.join(", ")}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={en.pairs.healthTies} count={health.ties.length}>
        <ul className="flex flex-wrap gap-2">
          {health.ties.map((id) => (
            <li key={id} className="flex items-center gap-2">
              {open(id)}
              <span className="t-meta text-quiet">{ctx.byId.get(id)?.images.slice(0, 2).map((i) => i.text).join(" / ")}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={en.pairs.healthShared} count={health.shared.length}>
        <ul className="flex flex-col gap-1">
          {health.shared.map((s) => (
            <li key={s.text} className="flex flex-wrap items-center gap-2">
              <span className="t-body">{s.text}</span>
              {s.pairs.map((id) => <span key={id}>{open(id)}</span>)}
            </li>
          ))}
        </ul>
      </Section>
      <Section title={en.pairs.healthSuggestions} count={suggestions.length}>
        <ul className="flex flex-col gap-2">
          {suggestions.map((s) => (
            <li key={`${s.imageId}>${s.suggestion}`} className="flex flex-wrap items-center gap-2">
              {open(s.pairId)}
              <span className="t-body">{en.pairs.replacePreview(s.text, s.suggestion)}</span>
              <button
                type="button"
                className="btn min-h-10 px-2"
                onClick={() => {
                  const pair = ctx.byId.get(s.pairId);
                  if (pair === undefined) return;
                  void ctx.save([renameOrMerge(pair, s.imageId, s.suggestion, nowIso())]).then((ok) => { setMessage(ok ? en.pairs.saved : en.pairs.saveFailed); });
                }}
              >
                {en.pairs.useSuggestion(s.suggestion)}
              </button>
              <button
                type="button"
                className="btn min-h-10 px-2"
                onClick={() => {
                  const next = [...dismissed, `${s.imageId}>${s.suggestion}`];
                  setDismissed(next);
                  writePreference("bld.pairs.dismissed", next);
                }}
              >
                {en.pairs.dismiss}
              </button>
            </li>
          ))}
        </ul>
      </Section>
      {outside.length > 0 ? (
        <Section title={en.pairs.healthOutsideScheme} count={outside.length}>
          <ul className="flex flex-wrap gap-2">
            {outside.map((id) => <li key={id}>{open(id)}</li>)}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

/** A memo to turn into a sentence of your own (AUDIT §6, Q4): pairs with their main images. Nothing typed is saved. */
export function PairSentence({ ctx }: { ctx: LibraryContext }) {
  const [seed] = useState(() => newId());
  const [index, setIndex] = useState(0);
  const [sentence, setSentence] = useState("");
  const memo = useMemo(() => sentenceMemo(ctx.reader.puzzle, ctx.reader.scheme, seed, index, ctx.reader.buffers.op), [ctx.reader, seed, index]);

  return (
    <div className="flex flex-col gap-4">
      <p className="t-meta text-quiet">
        {en.pairs.sentenceScramble}: <span className="t-notation">{memo.scramble}</span>
      </p>
      {memo.pieces.map((piece) => (
        <section key={piece.pieceType} className="flex flex-col gap-2">
          <h2 className="t-meta text-quiet">{en.pairs.sentencePieces[piece.pieceType]}</h2>
          <ul className="flex flex-wrap gap-2">
            {piece.pairs.map((id, i) => {
              const word = mainImage(ctx.byId.get(id))?.text;
              return (
                <li key={`${id}-${String(i)}`} className="panel flex min-w-20 flex-col px-2 py-1">
                  <span className="mono font-[600]">{id}</span>
                  <span className={word === undefined ? "t-meta text-quiet" : "t-body"}>{word ?? en.pairs.empty}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="t-body">{en.pairs.sentencePrompt}</p>
      <label className="flex flex-col gap-1">
        <span className="t-meta text-quiet">{en.pairs.sentenceLabel}</span>
        <textarea className="field min-h-24" value={sentence} onChange={(e) => { setSentence(e.target.value); }} />
      </label>
      <p className="t-meta text-quiet">{en.pairs.sentenceHint}</p>
      <div>
        <button type="button" className="btn btn-strong" onClick={() => { setIndex((n) => n + 1); setSentence(""); }}>{en.pairs.sentenceNew}</button>
      </div>
    </div>
  );
}

/** Find and replace, a category for the matching pairs, CSV import and export, and a pointer to the full backup. */
export function PairData({ ctx }: { ctx: LibraryContext }) {
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [problems, setProblems] = useState<readonly CsvProblem[]>([]);
  const matches = useMemo(() => findImages(ctx.pairs, find, replacement), [ctx.pairs, find, replacement]);
  const matchedPairs = [...new Set(matches.map((m) => m.pairId))];

  const exportCsv = () => {
    const blob = new Blob([libraryToCsv(ctx.pairs)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bldokja-letter-pairs-${nowIso().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    const { rows, problems: found } = csvRows(await file.text());
    setProblems(found);
    const merged = mergeCsvRows(ctx.pairs, rows, nowIso(), newId);
    const ok = await ctx.save(merged.changed);
    setMessage(ok ? en.pairs.csvImported(merged.added) : en.pairs.saveFailed);
  };

  return (
    <div className="flex flex-col gap-6">
      {message !== undefined ? <p className="t-meta" role="status">{message}</p> : null}
      <section className="flex flex-col gap-3">
        <h2 className="t-subheading">{en.pairs.findReplace}</h2>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="t-meta text-quiet">{en.pairs.find}</span>
            <input className="field w-full" value={find} onChange={(e) => { setFind(e.target.value); }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="t-meta text-quiet">{en.pairs.replaceWith}</span>
            <input className="field w-full" value={replacement} onChange={(e) => { setReplacement(e.target.value); }} />
          </label>
        </div>
        {find !== "" ? <p className="t-meta">{en.pairs.matches(matches.length)}</p> : null}
        {matches.length > 0 ? (
          <>
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {matches.map((m) => (
                <li key={m.imageId} className="t-meta">
                  <span className="mono font-[600]">{m.pairId}</span> {en.pairs.replacePreview(m.text, m.replaced)}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-end gap-3">
              <button
                type="button"
                className="btn btn-strong"
                disabled={replacement === find}
                onClick={() => {
                  void ctx.save(applyMatches(ctx.pairs, matches, nowIso())).then((ok) => { setMessage(ok ? en.pairs.replaced(matches.length) : en.pairs.saveFailed); });
                }}
              >
                {en.pairs.replaceAll}
              </button>
              <label className="flex flex-col gap-1">
                <span className="t-meta text-quiet">{en.pairs.bulkCategory}</span>
                <input className="field w-full" value={category} onChange={(e) => { setCategory(e.target.value); }} />
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const at = nowIso();
                  const changed = matchedPairs.flatMap((id) => {
                    const pair = ctx.byId.get(id);
                    return pair === undefined ? [] : [withDetails(pair, { notes: pair.notes ?? "", category }, at)];
                  });
                  void ctx.save(changed).then((ok) => { setMessage(ok ? en.pairs.categorySet(changed.length) : en.pairs.saveFailed); });
                }}
              >
                {en.pairs.setCategory}
              </button>
            </div>
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 border-t border-rule pt-4">
        <h2 className="t-subheading">{en.pairs.csvTitle}</h2>
        <p className="t-meta text-quiet">{en.pairs.csvHint}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={exportCsv}>{en.pairs.exportCsv}</button>
          <label className="flex min-w-0 max-w-full flex-col gap-1">
            <span className="t-meta text-quiet">{en.pairs.importCsv}</span>
            <input type="file" accept="text/csv,.csv" className="field w-full min-w-0 max-w-full py-2" onChange={(e) => { const f = e.target.files?.[0]; if (f !== undefined) void importCsv(f); }} />
          </label>
        </div>
        {problems.length > 0 ? (
          <ul className="flex flex-col gap-1" role="alert">
            {problems.map((p) => <li key={p.line} className="t-meta">{en.pairs.csvInvalid(p.line, en.pairs.csvProblem[p.reason])}</li>)}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 border-t border-rule pt-4">
        <h2 className="t-subheading">{en.pairs.jsonTitle}</h2>
        <p className="t-meta text-quiet">{en.pairs.jsonHint}</p>
        <TransitionLink href="/settings/" className="t-body">{en.pairs.jsonLink}</TransitionLink>
      </section>
    </div>
  );
}
