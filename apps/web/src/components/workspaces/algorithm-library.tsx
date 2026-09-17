"use client";

import type { AlgDataset } from "@bld/cube-engine";
import type { AlgPreference } from "@bld/storage";
import { useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { LastLayerExplorer } from "@/components/lesson/last-layer-explorer";
import { useSettings } from "@/components/settings/settings-provider";
import { algDatasets } from "@/content/algs";
import { workspaces as copy } from "@/i18n/workspaces";
import { csvCell, download } from "@/lib/download";
import { threeStyleForReader, useMethodData } from "@/lib/methods";
import { useReader, type Reader } from "@/lib/reader";
import { newId, nowIso } from "@/lib/storage-client";
import { useEvents } from "@/lib/use-events";
import { DEFAULT_WEIGHTS, ergonomicCounts, ergonomicScore, preferenceKey, type ErgonomicWeights } from "@/trainers/ergonomics";
import { median } from "@/trainers/guided-trace";
import { checkUserAlg, commCases, withUserAlg, withoutUserAlg, type CaseAlg, type CommCase } from "@/trainers/three-style";
import { WhyAlg } from "./why-alg";

export function AlgorithmLibrary() {
  const [family, setFamily] = useState<"cfop" | "comms" | "3bld-parity" | "4bld-parity">("comms");
  const puzzle = family === "4bld-parity" ? "4x4x4" : "3x3x3";
  return <div className="flex flex-col gap-6">
    <div className="control-row">
      <label className="t-ui flex items-center gap-2">{copy.algs.puzzle}<output className="field">{puzzle}</output></label>
      <label className="t-ui flex items-center gap-2">{copy.algs.family}<select className="field" value={family} onChange={(event) => setFamily(event.target.value as typeof family)}>
        {(["cfop", "comms", "3bld-parity", "4bld-parity"] as const).map((item) => <option value={item} key={item}>{copy.algs.groups[item]}</option>)}
      </select></label>
    </div>
    {family === "cfop" ? <LastLayerExplorer /> : family === "comms" ? <BlindAlgorithmLibrary /> : <ParityReference family={family} />}
  </div>;
}

function ParityReference({ family }: { family: "3bld-parity" | "4bld-parity" }) {
  const datasets = algDatasets();
  const sources = family === "3bld-parity" ? [datasets.opParity, datasets.m2opParity] : [datasets.r2Parity, datasets.u2Parity, datasets.cornerParity4x4];
  return <section className="flex flex-col gap-5" aria-label={copy.algs.groups[family]}>
    <p className="t-body text-quiet">{family === "3bld-parity" ? copy.algs.parityNote : copy.algs.fourParityNote}</p>
    {sources.map((dataset) => {
      const entry = dataset.records[0]?.algs[0];
      if (entry === undefined) return null;
      return <article className="trainer-surface grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.8fr)]" key={dataset.id}>
        <Cube puzzleId={dataset.puzzle} alg={entry.moves} controls label={`${dataset.id}: ${entry.alg}`} />
        <div className="flex flex-col gap-3 self-center"><h2 className="t-subheading">{dataset.id}</h2><p className="t-notation break-words">{entry.alg}</p><p className="t-meta text-quiet">{copy.algs.standard} · {entry.etm} {copy.common.moves}</p></div>
      </article>;
    })}
  </section>;
}

function BlindAlgorithmLibrary() {
  const reader = useReader();
  const built = useMethodData(reader, threeStyleForReader);
  const { stored } = useSettings();
  const [pieceType, setPieceType] = useState<"corners" | "edges">("corners");
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>();
  const [limit, setLimit] = useState(60);
  const [message, setMessage] = useState("");
  const dataset = built?.ok ? built.value[pieceType] : undefined;
  const cases = useMemo(() => reader === undefined || dataset === undefined ? [] : commCases(reader.puzzle, dataset, reader.scheme, stored?.algOverrides).cases, [reader, dataset, stored?.algOverrides]);
  const visible = useMemo(() => cases.filter((item) => (!mine || item.algs[0]?.source === "yours") && `${item.letters} ${item.recordId} ${item.algs[0]?.alg ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [cases, mine, search]);
  const current = cases.find((item) => item.id === selected) ?? visible[0];
  const csv = () => {
    const rows = [[copy.algs.case, copy.common.buffer, copy.common.targets, copy.common.preferred, copy.common.notation, copy.common.moves, copy.algs.rating, copy.algs.regrips, copy.algs.fingers, copy.algs.notes], ...visible.map((item) => {
      const alg = item.algs[0]; const preference = dataset === undefined || alg === undefined ? undefined : stored?.algPreferences?.[preferenceKey(dataset.id, item.recordId, alg.alg)];
      return [item.letters, item.buffer, item.recordId, alg?.alg ?? "", alg?.moves ?? "", String(alg?.etm ?? ""), String(preference?.rating ?? ""), String(preference?.regrips ?? ""), preference?.fingerTricks ?? "", preference?.notes ?? ""];
    })];
    download(new Blob(["\uFEFF", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }), copy.algs.csvName);
  };
  if (reader === undefined || dataset === undefined) return <p role={built?.ok === false ? "alert" : "status"}>{built?.ok === false ? copy.common.error : copy.common.loading}</p>;
  return <div className="flex flex-col gap-6">
    <div className="control-row">
      <label className="t-ui flex gap-2 items-center">{copy.common.targets}<select className="field" value={pieceType} onChange={(event) => { setPieceType(event.target.value as typeof pieceType); setSelected(undefined); }}><option value="corners">{copy.common.pieces.corners}</option><option value="edges">{copy.common.pieces.edges}</option></select></label>
      <label className="t-ui flex gap-2 items-center"><input type="checkbox" checked={mine} onChange={(event) => { setMine(event.target.checked); }} />{copy.common.mine}</label>
      <button type="button" className="btn ml-auto" onClick={csv}>{copy.algs.csv}</button>
    </div>
    <label className="flex flex-col gap-2 t-ui">{copy.common.search}<input type="search" className="field w-full" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(60); }} /></label>
    <p className="t-meta text-quiet">{copy.common.count(visible.length)} · {copy.common.buffer}: {dataset.buffer}</p>
    <div className="data-table-wrap max-h-[26rem]" tabIndex={0} data-shortcuts="off">
      <table className="data-table" aria-label={copy.algs.title}><thead><tr>{[copy.algs.case, copy.common.targets, copy.common.preferred, copy.common.moves, copy.algs.source].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{visible.slice(0, limit).map((item) => <tr key={item.id} aria-selected={current?.id === item.id}>
          <th scope="row"><button type="button" className="text-link mono" onClick={() => { setSelected(item.id); }}>{item.letters}</button></th><td className="mono">{item.recordId}</td><td className="t-notation max-w-[34rem] whitespace-normal">{item.algs[0]?.alg}</td><td>{item.algs[0]?.etm}</td><td className="t-meta text-quiet">{item.algs[0]?.source === "yours" ? copy.common.yours : copy.common.dataset}</td>
        </tr>)}</tbody></table>
    </div>
    {visible.length === 0 ? <p>{copy.common.empty}</p> : null}
    {limit < visible.length ? <button type="button" className="btn self-start" onClick={() => { setLimit((value) => value + 60); }}>{copy.common.count(Math.min(60, visible.length - limit))} · {copy.common.add}</button> : null}
    {current === undefined ? null : <CaseEditor key={current.id} reader={reader} dataset={dataset} current={current} report={setMessage} />}
    {message ? <p className="status-line" role="status">{message}</p> : null}
    <p className="t-meta text-quiet">{copy.common.local}</p>
  </div>;
}

function CaseEditor({ reader, dataset, current, report }: { reader: Reader; dataset: AlgDataset; current: CommCase; report: (message: string) => void }) {
  const { stored, update } = useSettings();
  const [typed, setTyped] = useState("");
  const [chosen, setChosen] = useState(current.algs[0]?.alg ?? "");
  const [ranking, setRanking] = useState<"ergonomic" | "shortest" | "personal">("ergonomic");
  const [weights, setWeights] = useState<ErgonomicWeights>(DEFAULT_WEIGHTS);
  const [why, setWhy] = useState(false);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const alg = current.algs.find((item) => item.alg === chosen) ?? current.algs[0];
  const key = preferenceKey(dataset.id, current.recordId, alg?.alg ?? "");
  const preference = stored?.algPreferences?.[key];
  const [draftState, setDraftState] = useState<{ key: string; value: AlgPreference }>({ key, value: preference ?? {} });
  const draft = draftState.key === key ? draftState.value : preference ?? {};
  const setDraft = (value: AlgPreference) => { setDraftState({ key, value }); };
  const ranked = [...current.algs].sort((a, b) => {
    const pa = stored?.algPreferences?.[preferenceKey(dataset.id, current.recordId, a.alg)];
    const pb = stored?.algPreferences?.[preferenceKey(dataset.id, current.recordId, b.alg)];
    return ranking === "shortest" ? a.etm - b.etm : ranking === "personal" ? (pb?.rating ?? 0) - (pa?.rating ?? 0) || a.etm - b.etm : ergonomicScore(a.alg, pa, weights) - ergonomicScore(b.alg, pb, weights);
  });
  const prefer = async (text: string) => {
    if (busy) return;
    const checked = checkUserAlg(reader.puzzle, dataset, current.recordId, text);
    if (!checked.ok) { report(copy.algs.invalid); return; }
    setBusy(true);
    try { await update({ algOverrides: withUserAlg(stored?.algOverrides, dataset.id, current.recordId, checked.alg.alg) }); setChosen(checked.alg.alg); setTyped(""); report(copy.common.saved); } catch { report(copy.common.error); } finally { setBusy(false); }
  };
  const submit = (event: SyntheticEvent) => { event.preventDefault(); void prefer(typed); };
  if (alg === undefined) return null;
  const counts = ergonomicCounts(alg.alg);
  return <section className="flex flex-col gap-6 border-t border-rule pt-6" aria-label={copy.algs.edit}>
    <div className="trainer-surface"><Cube setup={alg.inverseMoves} alg={alg.moves} controls highlight={[current.buffer, ...current.targets]} label={current.letters} /><div className="flex flex-col gap-4 self-center">
      <h2 className="t-heading">{current.letters} <span className="text-quiet t-meta">{current.recordId}</span></h2><p className="t-notation break-words">{alg.alg}</p>
      <p className="t-meta text-quiet">{copy.common.moves}: {counts?.moves} · {copy.algs.rotations}: {counts?.rotations} · {copy.algs.slices}: {counts?.slices} · {copy.algs.wide}: {counts?.wide}</p>
      <details className="quiet-disclosure" onToggle={(event) => { setWhy(event.currentTarget.open); }}><summary>{copy.algs.why}</summary>{why ? <div className="mt-4"><WhyAlg key={alg.alg} reader={reader} alg={alg.alg} setup={alg.inverseMoves} /></div> : null}</details>
      <form onSubmit={submit} className="flex flex-col gap-3"><label className="t-ui flex flex-col gap-2">{copy.common.algorithm}<input className="field mono w-full" value={typed} maxLength={200} onChange={(event) => { setTyped(event.target.value); }} /></label><button className="btn btn-strong self-start" type="submit" disabled={typed.trim() === "" || busy}>{copy.algs.save}</button></form>
    </div></div>
    <details className="quiet-disclosure"><summary>{copy.algs.alternatives}</summary><div className="flex flex-col gap-4 mt-4">
      <label className="t-ui control-row">{copy.algs.ranking}<select className="field" value={ranking} onChange={(event) => { setRanking(event.target.value as typeof ranking); }}>{(["ergonomic", "shortest", "personal"] as const).map((value) => <option key={value} value={value}>{copy.algs[value]}</option>)}</select></label>
      <p className="t-meta text-quiet">{copy.algs.heuristic}</p>
      <details className="quiet-disclosure"><summary>{copy.algs.weights}</summary><div className="grid gap-3 md:grid-cols-3 mt-3">{(Object.keys(weights) as (keyof ErgonomicWeights)[]).map((field) => <label className="t-meta flex flex-col gap-2" key={field}>{({ moves: copy.algs.moveWeight, rotations: copy.algs.rotationWeight, slices: copy.algs.sliceWeight, wide: copy.algs.wideWeight, regrips: copy.algs.regripWeight, preference: copy.algs.preferenceWeight })[field]}<input className="field" type="number" min={0} max={20} step={0.5} value={weights[field]} onChange={(event) => { setWeights({ ...weights, [field]: Math.min(20, Math.max(0, Number(event.target.value))) }); }} /></label>)}</div></details>
      {ranked.map((item) => <div className="flex flex-wrap gap-3 items-center border-b border-rule pb-3" key={item.alg}><button className="text-link t-notation text-left flex-1 min-w-0 break-words" type="button" onClick={() => { setChosen(item.alg); }}>{item.alg}</button><span className="t-meta text-quiet">{item.etm}</span><button type="button" className="btn" disabled={busy} onClick={() => { void prefer(item.alg); }}>{copy.algs.choose}</button>{item.source === "yours" ? <button className="btn" type="button" onClick={() => { void update({ algOverrides: withoutUserAlg(stored?.algOverrides, dataset.id, current.recordId, item.alg) }).catch(() => { report(copy.common.error); }); }}>{copy.common.remove}</button> : null}</div>)}
    </div></details>
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void update({ algPreferences: { ...stored?.algPreferences, [key]: draft } }).then(() => { report(copy.common.saved); }).catch(() => { report(copy.common.error); }); }}>
      <label className="t-ui flex flex-col gap-2">{copy.algs.rating}<select className="field" value={draft.rating ?? ""} onChange={(event) => { setDraft({ ...draft, rating: event.target.value === "" ? undefined : Number(event.target.value) }); }}><option value="">{copy.common.empty}</option>{[1,2,3,4,5].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="t-ui flex flex-col gap-2">{copy.algs.regrips}<input className="field" type="number" min={0} max={30} value={draft.regrips ?? ""} onChange={(event) => { setDraft({ ...draft, regrips: event.target.value === "" ? undefined : Number(event.target.value) }); }} /></label>
      {(["fingerTricks", "notes"] as const).map((field) => <label className="t-ui flex flex-col gap-2" key={field}>{field === "fingerTricks" ? copy.algs.fingers : copy.algs.notes}<textarea rows={3} className="field" maxLength={1000} value={draft[field] ?? ""} onChange={(event) => { setDraft({ ...draft, [field]: event.target.value }); }} /></label>)}
      <button type="submit" className="btn justify-self-start">{copy.common.save}</button>
    </form>
    <details className="quiet-disclosure" onToggle={(event) => { setCompare(event.currentTarget.open); }}><summary>{copy.algs.compare}</summary>{compare ? <AlternatingTrials current={current} /> : null}</details>
  </section>;
}

function AlternatingTrials({ current }: { current: CommCase }) {
  const { events, append } = useEvents();
  const [a, setA] = useState(current.algs[0]?.alg ?? "");
  const [b, setB] = useState(current.algs[1]?.alg ?? "");
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<"ready" | "running" | "stopped">("ready");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [runId] = useState(newId);
  const started = useRef(0);
  const alg: CaseAlg | undefined = current.algs.find((item) => item.alg === (index % 2 === 0 ? a : b));
  const trials = (events ?? []).filter((event) => event.type === "drill.attempt" && event.trainer === "alg-trial" && event.caseId === current.id && event.detail?.comparison === runId);
  const grade = async (correct: boolean) => {
    if (alg === undefined || state !== "stopped" || busy) return;
    setBusy(true);
    try { await append([{ id: newId(), type: "drill.attempt", at: nowIso(), trainer: "alg-trial", caseId: current.id, strategy: "alternating", correct, responseMs: Math.round(elapsed), detail: { comparison: runId, alg: alg.alg, side: index % 2 === 0 ? "A" : "B", trial: index, selfReported: true } }]); setIndex((value) => value + 1); setState("ready"); setMessage(""); } catch { setMessage(copy.common.error); } finally { setBusy(false); }
  };
  const valid = a !== b && a !== "" && b !== "";
  return <div className="flex flex-col gap-4 mt-4">
    <p className="t-body text-quiet">{copy.algs.trialIntro}</p>
    <div className="grid gap-3 md:grid-cols-2">{(["A", "B"] as const).map((side) => <label className="t-ui flex flex-col gap-2" key={side}>{side === "A" ? copy.algs.trialA : copy.algs.trialB}<select className="field w-full" disabled={state !== "ready" || index > 0} value={side === "A" ? a : b} onChange={(event) => { if (side === "A") setA(event.target.value); else setB(event.target.value); }}>{current.algs.map((item) => <option value={item.alg} key={item.alg}>{item.alg}</option>)}</select></label>)}</div>
    {!valid ? <p className="t-meta">{copy.algs.distinct}</p> : alg === undefined ? null : <>
      <p className="t-ui">{index % 2 === 0 ? copy.algs.trialA : copy.algs.trialB}</p><p className="t-notation">{alg.alg}</p><Cube setup={alg.inverseMoves} label={copy.algs.case} />
      <div className="control-row">{state === "ready" ? <button className="btn btn-strong" type="button" onClick={() => { started.current = performance.now(); setState("running"); }}>{copy.algs.start}</button> : state === "running" ? <button className="btn btn-strong" type="button" onClick={() => { setElapsed(performance.now() - started.current); setState("stopped"); }}>{copy.algs.stop}</button> : <><span className="t-notation">{copy.common.seconds(elapsed)}</span><button className="btn btn-strong" disabled={busy} type="button" onClick={() => { void grade(true); }}>{copy.algs.success}</button><button className="btn" disabled={busy} type="button" onClick={() => { void grade(false); }}>{copy.algs.failure}</button></>}</div>
    </>}
    <div className="grid gap-3 md:grid-cols-2">{[a,b].map((notation, side) => {
      const entries = trials.filter((event) => event.type === "drill.attempt" && event.detail?.alg === notation);
      const correct = entries.filter((event) => event.type === "drill.attempt" && event.correct);
      const ms = median(correct.flatMap((event) => event.type === "drill.attempt" ? [event.responseMs] : []));
      return <p className="t-meta" key={side}>{side === 0 ? copy.algs.trialA : copy.algs.trialB}: {copy.levels.attempts(entries.length, correct.length)} · {copy.algs.median}: {ms === undefined ? copy.common.empty : copy.common.seconds(ms)}</p>;
    })}</div>
    <p className="t-meta text-quiet">{copy.algs.insufficient}</p>{message ? <p role="alert">{message}</p> : null}
  </div>;
}
