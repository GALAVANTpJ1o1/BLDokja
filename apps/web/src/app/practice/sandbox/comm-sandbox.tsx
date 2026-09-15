"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { netCells } from "@/components/cube/cube-state";
import { Cube } from "@/components/cube/cube";
import { piecesOf } from "@/components/lesson/op-demos";
import { useSettings } from "@/components/settings/settings-provider";
import { algDatasets } from "@/content/algs";
import { en } from "@/i18n/en";
import { useReader } from "@/lib/reader";
import { analyseAlg, candidateComms } from "@/trainers/sandbox";

const ORIGIN: Record<"U" | "L" | "F" | "R" | "B" | "D", readonly [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
type Pieces = "corners" | "edges";

/**
 * The commutator sandbox (BRIEF §7.5). Type bracket notation and see it expanded, cancelled, counted and
 * animated with only the pieces it moves lit; pick three stickers and get verified comms for them; keep
 * notes in a scratchpad that is saved with your settings.
 */
export function CommSandbox() {
  const reader = useReader();
  const { stored, update } = useSettings();
  const [text, setText] = useState("");
  const [pieces, setPieces] = useState<Pieces>("corners");
  const [picked, setPicked] = useState<string[]>([]);
  const [scratch, setScratch] = useState<string | undefined>(undefined);
  const [scratchSaved, setScratchSaved] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  const analysis = useMemo(() => (reader === undefined || text.trim() === "" ? undefined : analyseAlg(reader.puzzle, text)), [reader, text]);
  const candidates = useMemo(() => {
    if (reader === undefined || picked.length !== 3) return undefined;
    const { threeStyleCorners, threeStyleEdges } = algDatasets();
    return candidateComms(reader.puzzle, { corners: threeStyleCorners, edges: threeStyleEdges }, picked);
  }, [reader, picked]);
  const cells = useMemo(() => (reader === undefined ? [] : netCells(reader.puzzle, reader.puzzle.kpuzzle.defaultPattern())), [reader]);

  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
    },
    [],
  );

  if (reader === undefined) return <p className="t-meta text-quiet">{en.cube.loading}</p>;

  const scratchValue = scratch ?? stored?.scratchpad ?? "";
  const onScratch = (value: string) => {
    setScratch(value);
    setScratchSaved(false);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void update({ scratchpad: value.slice(0, 20_000) }).then(() => { setScratchSaved(true); });
    }, 800);
  };

  const a = analysis?.ok === true ? analysis.analysis : undefined;
  const moved = a === undefined ? [] : (["corners", "edges", "centres"] as const).filter((k) => a.moved[k].length > 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="t-meta text-quiet">{en.sandbox.input}</span>
          <input className="field t-notation text-[1.125rem]" value={text} placeholder={en.sandbox.placeholder} spellCheck={false} autoComplete="off" onChange={(e) => { setText(e.target.value); }} />
        </label>
        {analysis?.ok === false && analysis.error.code !== "empty" ? (
          <p className="t-meta" role="alert">{en.sandbox.parseError(analysis.error.code, "index" in analysis.error ? analysis.error.index : 0)}</p>
        ) : null}
        {a !== undefined ? (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Cube key={a.cancelled} alg={a.cancelled} highlight={piecesOf(reader, a.movedStickers)} controls label={en.sandbox.cubeLabel(a.written)} />
            <div className="flex flex-col gap-3" aria-live="polite">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="t-meta text-quiet">{en.sandbox.written}</dt>
                <dd className="t-notation">{a.written}</dd>
                <dt className="t-meta text-quiet">{en.sandbox.expanded}</dt>
                <dd>
                  <span className="t-notation">{a.expanded}</span>
                  <span className="t-meta block text-quiet">{en.sandbox.counts(a.expandedCounts.htm, a.expandedCounts.qtm, a.expandedCounts.stm, a.expandedCounts.etm)}</span>
                </dd>
                <dt className="t-meta text-quiet">{en.sandbox.cancelled}</dt>
                <dd>
                  <span className="t-notation">{a.cancelled}</span>
                  <span className="t-meta block text-quiet">{en.sandbox.counts(a.cancelledCounts.htm, a.cancelledCounts.qtm, a.cancelledCounts.stm, a.cancelledCounts.etm)}</span>
                </dd>
              </dl>
              <p className="t-body">{en.sandbox.saved(a.saved)}</p>
              <h2 className="t-subheading">{en.sandbox.moves}</h2>
              {moved.length === 0 ? <p className="t-body">{en.sandbox.nothingMoves}</p> : null}
              <ul className="flex flex-col gap-1">
                {moved.map((k) => (
                  <li key={k} className="t-body">{en.sandbox.movedPieces(en.sandbox.pieceKinds[k], a.moved[k].join(", "))}</li>
                ))}
              </ul>
              {moved.length > 0 ? (
                <p className="t-body font-[600]">
                  {a.threeCycle === undefined ? en.sandbox.notThreeCycle : en.sandbox.threeCycle(en.sandbox.pieceKinds[a.threeCycle.pieceType].toLowerCase(), ...a.threeCycle.cycle)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <h2 className="t-heading">{en.sandbox.reverse}</h2>
        <p className="t-body text-quiet">{en.sandbox.reverseHint}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={en.scheme.pieces}>
          {(["corners", "edges"] as const).map((t) => (
            <button key={t} type="button" className="btn" aria-pressed={pieces === t} onClick={() => { setPieces(t); setPicked([]); }}>{en.scheme.pieceTypes[t]}</button>
          ))}
          <button type="button" className="btn" onClick={() => { setPicked([]); }} disabled={picked.length === 0}>{en.sandbox.clear}</button>
        </div>
        <div className="grid grid-cols-12 gap-[2px] self-start rounded-[4px] bg-body p-1" style={{ width: "min(100%, 30rem)" }}>
          {cells.map((c) => {
            const [fx, fy] = ORIGIN[c.slotFace];
            const name = reader.nameOf(c.index);
            const ofType = reader.pieceTypeOf(name) === pieces;
            const order = picked.indexOf(name);
            return (
              <button
                key={c.index}
                type="button"
                disabled={!ofType}
                aria-label={ofType ? `${name}, ${reader.letterOf(name) ?? ""}` : undefined}
                aria-pressed={ofType ? order >= 0 : undefined}
                onClick={() => { setPicked((p) => (p.includes(name) ? p.filter((s) => s !== name) : p.length >= 3 ? [name] : [...p, name])); }}
                className={`aspect-square rounded-[2px] t-ui font-[700] disabled:cursor-default ${order >= 0 ? "outline-2 outline-offset-1 outline-[var(--focus)]" : ""}`}
                style={{ gridColumn: fx * 3 + c.col + 1, gridRow: fy * 3 + c.row + 1, background: `var(--face-${c.colour.toLowerCase()})`, color: "var(--cube-body)", opacity: ofType ? 1 : 0.35 }}
              >
                {order >= 0 ? String(order + 1) : ""}
              </button>
            );
          })}
        </div>
        {picked.length > 0 ? <p className="t-meta">{en.sandbox.picked(picked.map((s) => `${s} (${reader.letterOf(s) ?? "?"})`).join(" → "))}</p> : null}
        {candidates?.ok === false ? <p className="t-body" role="alert">{en.sandbox.candidateError[candidates.error]}</p> : null}
        {candidates?.ok === true ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <p className="t-meta">{en.sandbox.candidates(candidates.comms.length)}</p>
            <ul className="flex flex-col gap-2">
              {candidates.comms.map((c) => (
                <li key={c.moves} className="flex flex-wrap items-center gap-3">
                  <span className="t-notation">{c.alg}</span>
                  <span className="t-meta text-quiet">{en.threeStyle.etm(c.etm)}</span>
                  <button type="button" className="btn min-h-9 px-2" onClick={() => { setText(c.alg); window.scrollTo({ top: 0 }); }}>{en.sandbox.load}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 border-t border-rule pt-6">
        <label className="flex flex-col gap-1">
          <span className="t-heading">{en.sandbox.scratchpad}</span>
          <span className="t-meta text-quiet">{en.sandbox.scratchpadHint}</span>
          <textarea className="field t-notation min-h-40" value={scratchValue} maxLength={20_000} spellCheck={false} onChange={(e) => { onScratch(e.target.value); }} />
        </label>
        {scratchSaved ? <p className="t-meta" role="status">{en.sandbox.scratchpadSaved}</p> : null}
      </section>
    </div>
  );
}
