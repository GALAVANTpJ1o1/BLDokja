"use client";

import { expandNodes, formatMoves, parseAlg, solveOpOp, stepMoves } from "@bld/cube-engine";
import type { FirstSolve as SavedSolve } from "@bld/storage";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { usePuzzle } from "@/components/cube/use-puzzle";
import { useSettings } from "@/components/settings/settings-provider";
import { TransmissionWindow } from "@/components/ui/transmission-window";
import { algDatasets } from "@/content/algs";
import { workspaces as copy } from "@/i18n/workspaces";
import { GATE_B_BUFFERS, readerFor } from "@/lib/reader";
import { newId, nowIso } from "@/lib/storage-client";
import { settingsSnapshot, useEvents } from "@/lib/use-events";
import { ScrambleControls, useScramble } from "@/lib/use-scramble";
import { sameLook } from "@/trainers/effects";

export function FirstSolve() {
  const puzzle = usePuzzle();
  const { stored, ready, update } = useSettings();
  const { append } = useEvents();
  const run = stored?.firstSolve;
  const runScramble = run?.scramble;
  const runKey = `${run?.id}:${run?.cursor}:${run?.memoCursor}`;
  const [seed] = useState(newId);
  const [index, setIndex] = useState(0);
  const random = useScramble(puzzle, seed, index, run === undefined || run.completedAt !== undefined);
  const reader = useMemo(() => puzzle === undefined ? undefined : readerFor(puzzle, { scheme: run?.scheme }), [puzzle, run?.scheme]);
  const solution = useMemo(() => {
    if (reader === undefined || runScramble === undefined) return undefined;
    const { opCorners, opEdges, opParity } = algDatasets();
    const result = solveOpOp(reader.puzzle, { alg: runScramble }, { scheme: reader.scheme, corners: opCorners, edges: opEdges, parity: opParity });
    return result.ok && sameLook(reader.puzzle, `${runScramble} ${formatMoves(result.value.moves)}`, "") ? result.value : undefined;
  }, [reader, runScramble]);
  const [typedState, setTypedState] = useState({ key: "", text: "" });
  const typed = typedState.key === runKey ? typedState.text : "";
  const setTyped = (text: string) => { setTypedState({ key: runKey, text }); };
  const [hintKey, setHintKey] = useState<string>();
  const hint = hintKey === runKey;
  const setHint = (value: boolean) => { setHintKey(value ? runKey : undefined); };
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [physical, setPhysical] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shownAt = useRef(0);
  useEffect(() => { shownAt.current = performance.now(); }, [runKey]);
  const save = async (next: SavedSolve) => { await update({ firstSolve: { ...next, updatedAt: nowIso() } }); };
  const start = async () => {
    if (random.scramble === undefined || reader === undefined || busy) return;
    setBusy(true);
    try {
      const at = nowIso();
      const scheme = stored?.scheme ?? { id: reader.scheme.id, name: reader.scheme.name, letters: { corners: reader.scheme.letters.corners ?? {}, edges: reader.scheme.letters.edges ?? {} } };
      await save({ id: newId(), scramble: random.scramble, cursor: -2, memoCursor: 0, scheme, buffers: GATE_B_BUFFERS.op, startedAt: at, updatedAt: at });
      setMessage(""); setPhysical(false);
    } catch { setMessage(copy.common.error); } finally { setBusy(false); }
  };
  if (!ready || puzzle === undefined || reader === undefined) return <p role="status">{copy.common.loading}</p>;
  if (run === undefined || run.completedAt !== undefined) return <div className="flex flex-col gap-6">
    {run?.completedAt !== undefined ? <p className="status-line">{copy.first.congratulations}</p> : null}
    <div className="trainer-surface" data-guide="first-intro"><Cube setup={random.scramble ?? ""} label={copy.first.scramble} /><div className="flex flex-col gap-4 self-center">
      <p>{copy.first.prerequisite}</p><Link className="text-link" href="/learn/what-is-blindfolded-solving/">{copy.first.lesson}</Link>
      <p className="t-meta text-quiet">{copy.first.convention}</p>
      <div className="flex flex-col gap-4" data-guide="first-begin">
        <ScrambleControls state={random} puzzle={puzzle} />
        <button type="button" className="btn btn-strong self-start" disabled={random.scramble === undefined || busy} onClick={() => { void start(); }}>{copy.first.start}</button>
      </div>
    </div></div>
    {message ? <p role="alert">{message}</p> : null}
  </div>;
  if (solution === undefined) return <p role="alert">{copy.common.error}</p>;
  const cursor = run.cursor;
  const pieceType = cursor === -2 ? "edges" : "corners";
  const trace = solution.traces[pieceType];
  const memoCursor = run.memoCursor ?? 0;
  const memoLetter = cursor < 0 ? trace.targets[memoCursor] : undefined;
  const step = cursor >= 0 ? solution.steps[cursor] : undefined;
  const before = solution.steps.slice(0, Math.max(0, cursor)).flatMap((item) => [...stepMoves(item)]);
  const setup = `${run.scramble} ${formatMoves(before)}`;
  const expected = step === undefined ? "" : formatMoves(stepMoves(step));
  const finished = cursor >= solution.steps.length;
  const advance = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy || finished) return;
    let correct: boolean;
    if (cursor < 0) correct = memoLetter === undefined || typed.trim().normalize("NFC").toLocaleUpperCase("en-GB") === memoLetter.normalize("NFC").toLocaleUpperCase("en-GB");
    else {
      const parsed = parseAlg(puzzle.id, typed.trim());
      correct = parsed.ok && typed.trim() !== "" && sameLook(puzzle, formatMoves(expandNodes(parsed.value.nodes)), expected);
    }
    if (!correct) { setMessage(copy.common.wrong); input.current?.focus(); return; }
    setBusy(true);
    try {
      const next = cursor < 0
        ? memoCursor + 1 < trace.targets.length ? { ...run, memoCursor: memoCursor + 1 } : { ...run, cursor: cursor + 1, memoCursor: 0 }
        : { ...run, cursor: cursor + 1 };
      await save(next);
      await append([{ id: newId(), type: "drill.attempt", at: nowIso(), trainer: "first-solve", caseId: `${run.id}:${cursor}:${memoCursor}`, strategy: "verified-steps", correct: true, responseMs: Math.round(performance.now() - shownAt.current), settings: settingsSnapshot({ ...stored, buffers: { op: run.buffers }, scheme: run.scheme }), detail: { phase: cursor < 0 ? "memo" : "execution", step: cursor, hinted: hint } }]);
      setMessage(copy.common.correct);
      setTimeout(() => input.current?.focus(), 0);
    } catch { setMessage(copy.common.error); } finally { setBusy(false); }
  };
  const title = cursor < 0 ? copy.first.memo(copy.common.pieces[pieceType], memoCursor, trace.targets.length) : copy.first.execution(cursor, solution.steps.length);
  const stepTitle = step?.kind === "target" ? copy.first.target(solution.traces[step.pieceType].targets[step.traceIndex] ?? reader.letterOf(step.target) ?? "", step.target) : step?.kind === "parity" ? copy.first.parity : step?.kind === "frame" ? copy.first.frame : copy.first.other;
  return <div className="flex flex-col gap-5">
    <p className="t-meta text-quiet">{copy.first.snapshot}</p>
    <details className="quiet-disclosure"><summary>{copy.first.scramble}</summary><p className="t-notation mt-2">{run.scramble}</p><p className="t-body mt-3">{copy.first.hold}</p><p className="t-meta text-quiet mt-2">{copy.first.orientation}</p></details>
    <div className="trainer-surface">
      <Cube setup={cursor < 0 ? run.scramble : setup} {...(hint && step !== undefined ? { alg: expected, controls: true } : {})} {...(cursor < 0 && memoLetter !== undefined ? { highlight: [trace.buffer.sticker, trace.targetStickers[memoCursor] ?? ""] } : {})} label={finished ? copy.first.finished : title} />
      <section className="flex flex-col gap-4 self-center" aria-label={title}>
        {finished ? <><h2 className="t-heading">{copy.first.finished}</h2><label className="t-body flex gap-3 items-center"><input type="checkbox" checked={physical} onChange={(event) => { setPhysical(event.target.checked); }} />{copy.first.physical}</label><button type="button" className="btn btn-strong" disabled={!physical || busy} onClick={() => { setBusy(true); void save({ ...run, completedAt: nowIso() }).catch(() => { setMessage(copy.common.error); }).finally(() => { setBusy(false); }); }}>{copy.first.complete}</button></> : <>
          <h2 className="t-heading">{title}</h2><p className="text-quiet">{cursor < 0 ? copy.first.memoPrompt : copy.first.executionPrompt}</p>
          {cursor >= 0 ? <p className="t-notation">{stepTitle}</p> : null}
          <form noValidate onSubmit={(event) => { void advance(event); }} className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 t-ui">{cursor < 0 ? copy.first.typedLetter : copy.first.typedMoves}<input ref={input} className="field mono w-full" value={typed} maxLength={2000} autoComplete="off" onChange={(event) => { setTyped(event.target.value); }} /></label>
            <button type="submit" className="btn btn-strong self-start" disabled={busy}>{copy.common.verify}</button>
          </form>
          <button type="button" className="text-link self-start" onClick={() => { setHint(true); }}>{copy.common.hint}</button>
          {hint ? <p className="status-line t-notation">{cursor < 0 ? `${memoLetter ?? ""} · ${trace.targetStickers[memoCursor] ?? ""}` : expected}</p> : null}
        </>}
        {message ? <p role="status" className="t-meta">{message}</p> : null}
      </section>
    </div>
    <details className="quiet-disclosure"><summary>{copy.first.progress}</summary>{(["edges", "corners"] as const).map((type) => <p className="t-notation mt-2" key={type}>{copy.common.pieces[type]}: {solution.traces[type].targets.slice(0, cursor >= 0 || cursor === -1 && type === "edges" ? undefined : type === pieceType ? memoCursor : 0).join(" ")}</p>)}</details>
    <><button type="button" className="text-link self-start" onClick={() => { setResetOpen(true); }}>{copy.first.restart}</button>
    <TransmissionWindow open={resetOpen} title={copy.first.restart} onClose={() => { setResetOpen(false); }} actions={<><button type="button" className="btn" onClick={() => { setResetOpen(false); }}>{copy.common.cancel}</button><button type="button" className="btn btn-strong" onClick={() => { setResetOpen(false); void update({ firstSolve: undefined }).then(() => { setIndex((value) => value + 1); }).catch(() => { setMessage(copy.common.error); }); }}>{copy.first.restart}</button></>}><p>{copy.first.reset}</p></TransmissionWindow></>
  </div>;
}
