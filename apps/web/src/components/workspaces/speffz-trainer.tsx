"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { usePuzzle } from "@/components/cube/use-puzzle";
import { readerFor } from "@/lib/reader";
import { recognitionQueue } from "@/trainers/speffz-recognition";
import { speffz as copy } from "@/i18n/speffz";
import { en } from "@/i18n/en";
import { Segmented } from "@/components/trainer/trainer-shell";
import { newId, nowIso } from "@/lib/storage-client";
import { useEvents } from "@/lib/use-events";
import type { DrillAttemptEvent } from "@bld/storage";
import { median } from "@/trainers/guided-trace";

export function SpeffzTrainer() {
  const puzzle = usePuzzle();
  const reader = useMemo(() => puzzle === undefined ? undefined : readerFor(puzzle), [puzzle]);
  const { events, append } = useEvents();
  const [family, setFamily] = useState<"edges" | "corners">("edges");
  const [count, setCount] = useState<"10" | "20" | "30" | "50">("20");
  const [run, setRun] = useState<{ seed: string; family: "edges" | "corners"; count: number }>();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [identified, setIdentified] = useState<string[]>([]);
  const [attempted, setAttempted] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [failedEvent, setFailedEvent] = useState<DrillAttemptEvent>();
  const [score, setScore] = useState({ correct: 0, total: 0, elapsed: 0 });
  const began = useRef(0);
  const prompt = useRef(0);
  const field = useRef<HTMLInputElement>(null);
  const queue = useMemo(() => puzzle === undefined || run === undefined ? [] : recognitionQueue(puzzle, run.family, run.count, run.seed), [puzzle, run]);
  const current = queue[index];
  const done = run !== undefined && current === undefined;
  const readyNext = current !== undefined && identified.length === current.stickers.length;
  const history = (events ?? []).filter((e): e is DrillAttemptEvent => e.type === "drill.attempt" && e.trainer === "speffz-recognition");
  const typical = median(history.map(e => e.responseMs));
  useEffect(() => { if (!busy && selected !== undefined && failedEvent === undefined) field.current?.focus(); }, [busy, selected, failedEvent]);
  const start = () => {
    setRun({ seed: newId(), family, count: Number(count) }); setIndex(0); setSelected(undefined); setIdentified([]); setAttempted([]); setTyped(""); setMessage(""); setFailedEvent(undefined); setScore({ correct: 0, total: 0, elapsed: 0 }); began.current = performance.now(); prompt.current = began.current;
  };
  const save = async (event: DrillAttemptEvent) => {
    setBusy(true);
    try { await append([event]); setFailedEvent(undefined); }
    catch { setFailedEvent(event); setMessage(copy.saveError); }
    finally { setBusy(false); }
  };
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (reader === undefined || current === undefined || selected === undefined || busy || failedEvent !== undefined || identified.includes(selected)) return;
    const expected = reader.letterOf(selected);
    if (expected === undefined || typed.trim() === "") return;
    const correct = typed.trim().toLocaleUpperCase("en-GB") === expected;
    const first = !attempted.includes(selected);
    if (first) {
      setAttempted(a => [...a, selected]);
      setScore(s => ({ ...s, correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
      await save({ id: newId(), type: "drill.attempt", at: nowIso(), trainer: "speffz-recognition", caseId: `${run?.family}:${selected}`, correct, responseMs: Math.round(performance.now() - prompt.current), seed: run?.seed ?? "", settings: { scheme: "speffz" }, detail: { skill: "recognition", piece: current.id, sticker: selected, letter: expected, typed, pieceIndex: index } });
    }
    setTyped("");
    if (correct) {
      const updated = [...identified, selected]; setIdentified(updated); setMessage(updated.length === current.stickers.length ? copy.pieceDone : copy.correct);
      setSelected(current.stickers.find(s => !updated.includes(s))); prompt.current = performance.now();
    } else setMessage(copy.wrong(expected));
    field.current?.focus();
  };
  const next = () => {
    if (!readyNext || busy || failedEvent !== undefined) return;
    setIndex(i => i + 1); setIdentified([]); setAttempted([]); setSelected(undefined); setTyped(""); setMessage(""); prompt.current = performance.now();
    if (index + 1 === queue.length) setScore(s => ({ ...s, elapsed: performance.now() - began.current }));
  };
  if (reader === undefined) return <p role="status">{copy.loading}</p>;
  return <div className="flex flex-col gap-6">
    {run === undefined || done ? <div className="flex flex-col gap-4">
      <Segmented label={copy.family} options={["edges", "corners"]} labels={{ edges: copy.edges, corners: copy.corners }} value={family} onChange={setFamily} />
      <Segmented label={copy.count} options={["10", "20", "30", "50"]} labels={{ "10": "10", "20": "20", "30": "30", "50": "50" }} value={count} onChange={setCount} />
      <p className="t-meta text-quiet">{copy.ready}</p><button className="btn btn-strong self-start" type="button" onClick={start}>{done ? copy.restart : copy.start}</button>
    </div> : null}
    <p className="t-meta text-quiet">{copy.fixed}</p>
    {current !== undefined ? <div className="grid gap-6 md:grid-cols-2">
      <Cube highlight={current.stickers} revealOnly label={copy.progress(index + 1, queue.length)} />
      <div className="flex flex-col gap-4">
        <p className="t-subheading">{copy.progress(index + 1, queue.length)}</p><p className="t-body">{copy.choose}</p>
        <div className="flex flex-wrap gap-3">{current.stickers.map(sticker => {
          const face = reader.faceOf(sticker); const label = copy.selected(en.cube.colourNames[face], face);
          return <button type="button" key={sticker} className="btn grid min-h-24 min-w-20 place-items-center gap-2 border-2" style={{ borderColor: selected === sticker ? "var(--text)" : "var(--rule)" }} aria-label={label} aria-pressed={selected === sticker} disabled={busy || failedEvent !== undefined || identified.includes(sticker)} onClick={() => { setSelected(sticker); setTyped(""); field.current?.focus(); }}>
            <span className="grid h-12 w-12 place-items-center rounded-md" style={{ background: `var(--face-${face.toLowerCase()})`, color: "var(--cube-body)" }}>{identified.includes(sticker) ? reader.letterOf(sticker) : "?"}</span><span className="t-meta">{en.cube.colourNames[face]}<br />{face}</span>
          </button>;
        })}</div>
        <form noValidate onSubmit={event => { void submit(event); }} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 t-ui">{copy.answer}<input ref={field} className="field w-24 text-center" autoComplete="off" autoCapitalize="characters" maxLength={1} value={typed} disabled={selected === undefined || busy || failedEvent !== undefined} onChange={e => { setTyped(e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }} /></label>
          <button type="submit" className="btn btn-strong" disabled={selected === undefined || busy || failedEvent !== undefined}>{copy.check}</button>
        </form>
        <p role="status" className="t-meta min-h-12">{failedEvent !== undefined ? copy.saveError : message}</p>
        {failedEvent !== undefined ? <button className="btn" disabled={busy} onClick={() => { void save(failedEvent); }}>{copy.retry}</button> : null}
        <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-strong" disabled={!readyNext || busy || failedEvent !== undefined} onClick={next}>{copy.next}</button><button type="button" className="btn" disabled={busy || failedEvent !== undefined} onClick={() => { setRun(undefined); setMessage(copy.ended); }}>{copy.pause}</button></div>
      </div>
    </div> : done ? <section className="panel p-5 flex flex-col gap-3" aria-label={copy.complete}><h2 className="t-heading">{copy.complete}</h2><p className="t-notation">{copy.elapsed(score.elapsed)}</p><p>{copy.perPiece(score.elapsed / queue.length)}</p><p>{copy.accuracy(score.correct, score.total)}</p><p className="t-meta text-quiet">{copy.saved}</p></section> : <p role="status">{message}</p>}
    <section className="border-t border-rule pt-5"><h2 className="t-heading">{copy.history}</h2><p className="t-meta text-quiet mt-2">{history.length === 0 ? copy.noHistory : copy.accuracy(history.filter(e => e.correct).length, history.length)}</p>{typical === undefined ? null : <p className="t-notation mt-2">{copy.typical(typical)}</p>}</section>
  </div>;
}
