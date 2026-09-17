"use client";

import { expandNodes, formatMoves, invertMoves, parseAlg, pieceType } from "@bld/cube-engine";
import type { Settings } from "@bld/storage";
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { useSettings } from "@/components/settings/settings-provider";
import { workspaces as copy } from "@/i18n/workspaces";
import { m2opData, threeStyleForReader, useMethodData } from "@/lib/methods";
import { useReader } from "@/lib/reader";
import { newId, nowIso } from "@/lib/storage-client";
import { useEvents } from "@/lib/use-events";
import { ScrambleControls, useScramble } from "@/lib/use-scramble";
import { sameLook } from "@/trainers/effects";
import { median } from "@/trainers/guided-trace";
import { checkUserAlg, commCases } from "@/trainers/three-style";

type Level = NonNullable<Settings["trainerLevel"]>;
const levels: readonly Level[] = ["recognition", "setup", "algorithm", "blind", "solves"];
export function ProgressiveTrainer() {
  const reader = useReader();
  const { stored, update } = useSettings();
  const { events, append } = useEvents();
  const level = stored?.trainerLevel ?? "recognition";
  const [index, setIndex] = useState(0);
  const [seed] = useState(newId);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const started = useRef(0);
  const op = useMethodData(level === "setup" ? reader : undefined, m2opData);
  const three = useMethodData(level === "algorithm" || level === "blind" ? reader : undefined, threeStyleForReader);
  const dataset = three?.ok ? three.value.corners : undefined;
  const cases = useMemo(() => reader === undefined || dataset === undefined ? [] : commCases(reader.puzzle, dataset, reader.scheme, stored?.algOverrides).cases, [reader, dataset, stored?.algOverrides]);
  const current = cases[index % Math.max(1, cases.length)];
  const recognitionTargets = useMemo(() => {
    if (reader === undefined) return [];
    const pieces = pieceType(reader.puzzle, "corners");
    const buffer = pieces.stickerByName(reader.buffers.op.corners)?.position;
    return pieces.stickers.filter((sticker) => sticker.position !== buffer);
  }, [reader]);
  const recognition = recognitionTargets[index % Math.max(1, recognitionTargets.length)];
  const record = op?.ok ? op.value.op.corners.records[index % op.value.op.corners.records.length] : undefined;
  const random = useScramble(reader?.puzzle, seed, index, level === "solves");
  const sessionKey = JSON.stringify([index, level, current?.id, record?.target, random.scramble]);
  const [session, setSession] = useState({ key: "", typed: "", hidden: false, hint: false, message: "", graded: false });
  const fresh = { key: sessionKey, typed: "", hidden: false, hint: false, message: "", graded: false };
  const { typed, hidden, hint, message, graded } = session.key === sessionKey ? session : fresh;
  const change = (patch: Partial<typeof session>) => { setSession((value) => ({ ...(value.key === sessionKey ? value : fresh), ...patch })); };
  const setTyped = (typed: string) => { change({ typed }); };
  const setHidden = (hidden: boolean) => { change({ hidden }); };
  const setHint = (hint: boolean) => { change({ hint }); };
  const setMessage = (message: string) => { change({ message }); };
  const setGraded = (graded: boolean) => { change({ graded }); };
  useEffect(() => {
    started.current = performance.now();
  }, [sessionKey]);
  const next = () => { setIndex((value) => value + 1); setTimeout(() => field.current?.focus(), 0); };
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (reader === undefined || busy || graded || level === "blind" && !hidden) return;
    let correct = false;
    let caseId = recognition?.name ?? String(index);
    if (level === "recognition") correct = typed.trim().normalize("NFC").toLocaleUpperCase("en-GB") === (recognition === undefined ? "" : reader.letterOf(recognition.name)?.normalize("NFC").toLocaleUpperCase("en-GB"));
    else if (level === "setup" && record !== undefined && op?.ok) {
      const parsed = parseAlg(reader.puzzle.id, typed);
      if (parsed.ok) {
        const setup = expandNodes(parsed.value.nodes);
        correct = sameLook(reader.puzzle, `${formatMoves(setup)} ${op.value.op.corners.swap.alg} ${formatMoves(invertMoves(setup))}`, record.algs[0]?.moves ?? "");
      }
      caseId = `corners@${op.value.op.corners.buffer}:${record.target}`;
    } else if ((level === "algorithm" || level === "blind") && current !== undefined && dataset !== undefined) {
      correct = checkUserAlg(reader.puzzle, dataset, current.recordId, typed).ok;
      caseId = current.id;
    } else if (level === "solves" && random.scramble !== undefined) {
      const parsed = parseAlg(reader.puzzle.id, typed);
      correct = parsed.ok && typed.trim() !== "" && sameLook(reader.puzzle, `${random.scramble} ${formatMoves(expandNodes(parsed.value.nodes))}`, "");
      caseId = `solve:${seed}:${index}`;
    }
    setBusy(true);
    try {
      await append([{ id: newId(), type: "drill.attempt", at: nowIso(), trainer: `level-${level}`, caseId, strategy: "progressive", correct, responseMs: Math.round(Math.max(0, event.timeStamp - started.current)), detail: { level, hinted: hint, reconstructed: level === "blind" || level === "solves" } }]);
      setMessage(correct ? copy.common.correct : copy.common.wrong);
      setGraded(true);
    } catch { setMessage(copy.common.error); } finally { setBusy(false); field.current?.focus(); }
  };
  const available = level === "recognition" ? recognition !== undefined : level === "setup" ? record !== undefined : level === "solves" ? random.scramble !== undefined : current !== undefined;
  const setup = level === "solves" ? random.scramble ?? "" : level === "setup" ? (() => { const parsed = parseAlg("3x3x3", record?.algs[0]?.moves ?? ""); return parsed.ok ? formatMoves(invertMoves(expandNodes(parsed.value.nodes))) : ""; })() : current?.algs[0]?.inverseMoves ?? "";
  const targets = level === "recognition" ? [recognition?.name ?? ""] : level === "setup" ? [op?.ok ? op.value.op.corners.buffer : "", record?.target ?? ""] : current === undefined ? [] : [current.buffer, ...current.targets];
  const answer = level === "recognition" ? recognition === undefined ? "" : reader?.letterOf(recognition.name) : level === "setup" ? record?.setup : current?.algs[0]?.moves;
  return <div className="flex flex-col gap-6">
    <nav className="step-track" aria-label={copy.levels.select}>{levels.map((value) => <button type="button" className="btn" key={value} aria-pressed={level === value} onClick={() => { void update({ trainerLevel: value }).catch(() => { setMessage(copy.common.error); }); }}>{copy.levels.names[value]}</button>)}</nav>
    <p className="t-meta text-quiet">{copy.levels.noGate}</p>
    {level === "solves" ? <ScrambleControls state={random} {...(reader === undefined ? {} : { puzzle: reader.puzzle })} /> : null}
    <div className="trainer-surface">
      {hidden ? <div className="hero-stage grid place-items-center min-h-80"><p className="t-ui text-quiet">{copy.levels.names.blind}</p></div> : <Cube setup={level === "recognition" ? "" : setup} {...(targets.length === 0 || level === "solves" ? {} : { highlight: targets })} label={copy.levels.names[level]} />}
      <div className="flex flex-col gap-4 self-center">
        <h2 className="t-heading">{copy.levels.names[level]}</h2><p className="t-body text-quiet">{copy.levels.descriptions[level]}</p>
        {level === "recognition" ? <p className="t-meta text-quiet">{copy.levels.recognitionNote}</p> : null}
        {level === "blind" || level === "solves" ? <p className="t-meta text-quiet">{copy.levels.blindNote}</p> : null}
        {level === "algorithm" || level === "blind" ? <p className="t-notation">{current?.letters} · {current?.recordId}</p> : level === "setup" ? <p className="t-notation">{record?.target}</p> : null}
        {level === "solves" ? <p className="t-notation break-words">{random.scramble}</p> : null}
        {level === "blind" && !hidden && !graded ? <button className="btn btn-strong" type="button" disabled={!available} onClick={() => { setHidden(true); started.current = performance.now(); field.current?.focus(); }}>{copy.levels.hide}</button> : null}
        <form noValidate className="flex flex-col gap-3" onSubmit={(event) => { void submit(event); }}>
          <label className="t-ui flex flex-col gap-2">{copy.levels.answer}<input ref={field} className="field mono w-full" autoComplete="off" maxLength={10_000} value={typed} disabled={!available} onChange={(event) => { setTyped(event.target.value); }} /></label>
          <button className="btn btn-strong self-start" type="submit" disabled={!available || busy || graded || level === "blind" && !hidden}>{copy.common.verify}</button>
        </form>
        {!available ? <p role="status" className="t-meta">{copy.common.loading}</p> : null}
        {message ? <p role="status" className="status-line">{message}</p> : null}
        {graded ? <div className="control-row"><button type="button" className="btn btn-strong" onClick={next}>{copy.common.next}</button><button type="button" className="btn" onClick={() => { setGraded(false); started.current = performance.now(); field.current?.focus(); }}>{copy.common.retry}</button></div> : null}
        {level !== "blind" && level !== "solves" ? <button type="button" className="text-link self-start" onClick={() => { setHint(true); }}>{copy.common.hint}</button> : null}
        {hint ? <p className="t-notation">{answer}</p> : null}
      </div>
    </div>
    <section className="border-t border-rule pt-5 flex flex-col gap-4" aria-label={copy.levels.stats}><h2 className="t-heading">{copy.levels.stats}</h2><div className="data-table-wrap"><table className="data-table"><thead><tr><th scope="col">{copy.levels.select}</th><th scope="col">{copy.common.result}</th><th scope="col">{copy.algs.median}</th></tr></thead><tbody>{levels.map((value) => {
      const attempts = (events ?? []).flatMap((event) => event.type === "drill.attempt" && event.trainer === `level-${value}` ? [event] : []);
      const correct = attempts.filter((event) => event.correct); const ms = median(correct.map((event) => event.responseMs));
      return <tr key={value}><th scope="row">{copy.levels.names[value]}</th><td>{copy.levels.attempts(attempts.length, correct.length)}</td><td>{ms === undefined ? copy.levels.none : copy.common.seconds(ms)}</td></tr>;
    })}</tbody></table></div></section>
  </div>;
}
