"use client";

import { compileLettering, pieceType, speffzScheme, trace, type PieceTypeId } from "@bld/cube-engine";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { StickerNet } from "@/components/cube/sticker-net";
import { netCells, patternFor } from "@/components/cube/cube-state";
import { usePuzzle } from "@/components/cube/use-puzzle";
import { workspaces as copy } from "@/i18n/workspaces";
import { newId, nowIso } from "@/lib/storage-client";
import { useEvents } from "@/lib/use-events";
import { ScrambleControls, useScramble } from "@/lib/use-scramble";

const families = ["corners", "midges", "wings", "xcenters", "tcenters"] as const satisfies readonly PieceTypeId[];
type Family = typeof families[number];
export function BigCubes() {
  const [stage, setStage] = useState(0);
  const [mode, setMode] = useState<"recognition" | "trace">("recognition");
  const [opened, setOpened] = useState(false);
  const [index, setIndex] = useState(0);
  const family: Family = families[stage] ?? "corners";
  return <div className="flex flex-col gap-8">
    <section className="flex flex-col gap-5"><h2 className="t-heading">{copy.big.compare}</h2>
      <div className="grid gap-5 md:grid-cols-2"><div><h3 className="t-ui mb-2">{copy.big.three}</h3><Cube label={copy.big.three} /><p className="t-body text-quiet mt-3">{copy.big.unchanged}</p></div><div><h3 className="t-ui mb-2">{copy.big.four}</h3><Cube puzzleId="4x4x4" label={copy.big.four} /><p className="t-body text-quiet mt-3">{copy.big.wings}</p></div></div>
      <div className="flex flex-col gap-3 border-t border-rule pt-4">{[copy.big.centres,copy.big.frame,copy.big.parity].map((text) => <p className="t-body" key={text}>{text}</p>)}</div>
      <Link className="text-link self-start" href="/learn/4x4-what-changes/">{copy.big.open}</Link>
    </section>
    <section className="flex flex-col gap-5 border-t border-rule pt-6" aria-label={copy.big.five}><h2 className="t-heading">{copy.big.five}</h2>
      <p className="status-line t-meta" role="note"><strong className="font-[650]">{copy.big.buildingLabel}:</strong> {copy.big.noSolve}</p>
      <nav className="step-track" aria-label={copy.big.family}>{families.map((value,position) => <button className="btn" type="button" key={value} aria-pressed={stage === position} onClick={() => { setStage(position); setOpened(false); }}>{copy.big.families[value]}</button>)}</nav>
      <h3 className="t-heading">{copy.big.families[family]}</h3><p className="t-body max-w-[65ch]">{copy.big.familyDescriptions[family]}</p>
      <div className="control-row"><button type="button" className="btn" disabled={stage === 0} onClick={() => { setStage((value) => value - 1); setOpened(false); }}>{copy.big.previous}</button><button type="button" className="btn" disabled={stage === families.length - 1} onClick={() => { setStage((value) => value + 1); setOpened(false); }}>{copy.big.next}</button></div>
      <div className="control-row"><button className="btn" aria-pressed={mode === "recognition"} type="button" onClick={() => { setMode("recognition"); setOpened(true); }}>{copy.big.recognition}</button><button className="btn btn-strong" aria-pressed={mode === "trace"} type="button" onClick={() => { setMode("trace"); setOpened(true); }}>{copy.big.trace}</button></div>
      {opened ? <FamilyDrill key={`${family}:${mode}:${index}`} family={family} mode={mode} index={index} next={() => { setIndex((value) => value + 1); }} /> : <Cube puzzleId="5x5x5" label={copy.big.families[family]} />}
    </section>
  </div>;
}

function FamilyDrill({ family, mode, index, next }: { family: Family; mode: "recognition" | "trace"; index: number; next: () => void }) {
  const puzzle = usePuzzle("5x5x5");
  const scheme = useMemo(() => puzzle === undefined ? undefined : speffzScheme(puzzle),[puzzle]);
  const type = useMemo(() => puzzle === undefined ? undefined : pieceType(puzzle,family),[puzzle,family]);
  const entries = Object.entries(scheme?.letters[family] ?? {});
  const [bufferChoice, setBuffer] = useState<string>();
  const buffer = bufferChoice ?? entries[0]?.[0] ?? "";
  const [seed] = useState(newId);
  const random = useScramble(puzzle,seed,index,mode === "trace");
  const traced = useMemo(() => puzzle === undefined || scheme === undefined || random.scramble === undefined ? undefined : trace(puzzle,{ alg:random.scramble },{ pieceType:family,buffer,scheme,frame:{ kind:"asIs" },policy:{ orientedInPlace:"asTargets" } }),[puzzle,scheme,random.scramble,family,buffer]);
  const [position,setPosition] = useState(0);
  const [typed,setTyped] = useState("");
  const [message,setMessage] = useState("");
  const [revealed,setRevealed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [doneRecognition,setDoneRecognition] = useState(false);
  const { append } = useEvents();
  const input = useRef<HTMLInputElement>(null);
  const started = useRef(0);
  const recognition = entries[index % Math.max(1,entries.length)];
  const target = mode === "recognition" ? recognition?.[0] : traced?.ok ? traced.value.targetStickers[position] : undefined;
  const expected = mode === "recognition" ? recognition?.[1] : traced?.ok ? traced.value.targets[position] : undefined;
  useEffect(() => { started.current = performance.now(); },[target]);
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (expected === undefined || busy) return;
    const correct = typed.trim().normalize("NFC").toLocaleUpperCase("en-GB") === expected.normalize("NFC").toLocaleUpperCase("en-GB");
    setBusy(true);
    try {
      await append([{ id:newId(),type:"drill.attempt",at:nowIso(),trainer:`5bld-${mode}`,caseId:`${family}@${buffer}:${target}`,strategy:"family-path",correct,responseMs:Math.round(performance.now()-started.current),detail:{ family,mode,revealed } }]);
      setMessage(correct ? copy.common.correct : copy.common.wrong);
      if (correct) { setTyped(""); if (mode === "trace") setPosition((value) => value+1); else setDoneRecognition(true); }
    } catch { setMessage(copy.common.error); } finally { setBusy(false); input.current?.focus(); }
  };
  const finished = mode === "recognition" ? doneRecognition : traced?.ok && position >= traced.value.targets.length;
  if (puzzle === undefined || type === undefined || scheme === undefined || !compileLettering(puzzle,scheme,family).ok) return <p role="status">{copy.common.loading}</p>;
  const centreFamily = family === "xcenters" || family === "tcenters";
  const pattern = patternFor(puzzle, mode === "recognition" ? "" : random.scramble ?? "");
  const precise = new Set([target, ...(mode === "trace" ? [buffer] : [])].flatMap((name) => { const sticker = name === undefined ? undefined : type.stickerByName(name); return sticker === undefined ? [] : [sticker.index]; }));
  return <div className="flex flex-col gap-5">
    {mode === "trace" ? <><p className="t-meta">{copy.first.hold}</p><ScrambleControls state={random} puzzle={puzzle} onChange={() => { setPosition(0); setTyped(""); setRevealed(false); setMessage(""); }} /><label className="t-ui control-row">{copy.big.buffer}<select className="field" value={buffer} onChange={(event) => { setBuffer(event.target.value); setPosition(0); setTyped(""); setRevealed(false); }}>{entries.map(([sticker,letter]) => <option key={sticker} value={sticker}>{letter} · {sticker}</option>)}</select></label><p className="t-notation">{random.scramble}</p></> : null}
    <div className="trainer-surface"><div className="cube-group flex flex-col gap-3"><Cube puzzleId="5x5x5" setup={mode === "recognition" ? "" : random.scramble ?? ""} {...(centreFamily ? {} : { highlight: target === undefined ? [] : [target,...(mode === "trace" ? [buffer] : [])] })} label={copy.big.families[family]} />{centreFamily && pattern !== undefined ? <><p className="t-meta text-quiet">{copy.big.preciseNet}</p><StickerNet cells={netCells(puzzle,pattern)} size={5} highlight={precise} label={copy.big.families[family]} className="w-full max-w-sm self-center" /></> : null}</div><div className="flex flex-col gap-4 self-center">
      {finished ? <><p role="status" className="status-line">{copy.common.correct}</p><button className="btn btn-strong" type="button" onClick={next}>{copy.common.next}</button></> : <form noValidate className="flex flex-col gap-3" onSubmit={(event) => { void submit(event); }}><label className="t-ui flex flex-col gap-2">{copy.big.target}<input ref={input} className="field mono" value={typed} maxLength={20} onChange={(event) => { setTyped(event.target.value); }} /></label><button type="submit" className="btn btn-strong self-start" disabled={busy || expected === undefined}>{copy.big.nextTarget}</button></form>}
      {message ? <p className="t-meta" role="status">{message}</p> : null}
      <button className="text-link self-start" type="button" onClick={() => { setRevealed(true); }}>{copy.common.hint}</button>
      {revealed ? <p className="t-notation">{expected} · {target}</p> : null}
      {traced?.ok ? <details className="quiet-disclosure"><summary>{copy.big.reveal}</summary><p className="t-notation mt-3">{traced.value.targets.join(" ")}</p></details> : null}
    </div></div>
  </div>;
}
