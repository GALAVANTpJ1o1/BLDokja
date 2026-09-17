"use client";

import { expandNodes, formatMoves, invertNodes, parseAlg, type LastLayerKind } from "@bld/cube-engine";
import { useMemo, useState } from "react";
import { Cube } from "@/components/cube/cube";
import { algDatasets } from "@/content/algs";
import { workspaces as copy } from "@/i18n/workspaces";

const kinds: readonly LastLayerKind[] = ["eo", "co", "oll", "corner-perm", "edge-perm", "pll"];

function inverse(text: string): string {
  const parsed = parseAlg("3x3x3", text);
  return parsed.ok ? formatMoves(expandNodes(invertNodes(parsed.value.nodes))) : "";
}

/** A shared compact viewer: cases, notation and cube playback all come from one verified dataset. */
export function LastLayerExplorer({ kind: requestedKind, compact = "false" }: { kind?: string; compact?: string }) {
  const initial = kinds.includes(requestedKind as LastLayerKind) ? requestedKind as LastLayerKind : "eo";
  const [kind, setKind] = useState<LastLayerKind>(initial);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>();
  const [tempo, setTempo] = useState(1);
  const dataset = algDatasets().cfopLastLayer.find((item) => item.kind === kind);
  const records = useMemo(() => (dataset?.records ?? []).filter((record) => `${record.id} ${record.algs[0]?.alg ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [dataset, search]);
  const current = records.find((record) => record.id === selected) ?? records[0];
  const alg = current?.algs[0];
  const short = compact === "true";
  return <section className={`last-layer-explorer ${short ? "last-layer-compact" : ""}`} aria-label={copy.cfop.referenceTitle}>
    {!short ? <header className="flex flex-col gap-1"><h2 className="t-heading">{copy.cfop.referenceTitle}</h2><p className="t-body text-quiet">{copy.cfop.referenceIntro}</p></header> : null}
    <div className="control-row">
      <label className="t-ui flex items-center gap-2">{copy.cfop.stage}<select className="field" value={kind} onChange={(event) => { setKind(event.target.value as LastLayerKind); setSelected(undefined); }}>
        {kinds.map((item) => <option value={item} key={item}>{copy.cfop.groups[item]}</option>)}
      </select></label>
      <label className="t-ui flex items-center gap-2">{copy.cfop.speed}<select className="field" value={tempo} onChange={(event) => { setTempo(Number(event.target.value)); }}><option value={0.6}>0.6×</option><option value={1}>1×</option><option value={1.5}>1.5×</option></select></label>
    </div>
    {!short ? <label className="t-ui flex flex-col gap-2">{copy.cfop.search}<span className="search-field"><input type="search" className="field" value={search} onChange={(event) => { setSearch(event.target.value); setSelected(undefined); }} />{search !== "" ? <button type="button" className="btn search-clear" onClick={() => { setSearch(""); setSelected(undefined); }}>{copy.common.clear}</button> : null}</span></label> : null}
    <p className="t-meta text-quiet">{copy.cfop.cases(records.length)} · {copy.cfop.cues[kind]}</p>
    <div className="data-table-wrap max-h-64" tabIndex={0} data-shortcuts="off"><table className="data-table" aria-label={copy.cfop.groups[kind]}><thead><tr><th scope="col">{copy.cfop.case}</th><th scope="col">{copy.cfop.notation}</th></tr></thead><tbody>
      {records.map((record) => <tr key={record.id} aria-selected={current?.id === record.id}><th scope="row"><button className="text-link mono" type="button" onClick={() => { setSelected(record.id); }}>{record.id}</button></th><td className="t-notation whitespace-normal">{record.algs[0]?.alg}</td></tr>)}
    </tbody></table></div>
    {current === undefined || alg === undefined ? <p className="t-body">{copy.common.empty}</p> : <div className="trainer-surface grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)]"><Cube setup={inverse(alg.moves)} alg={alg.moves} controls tempo={tempo} label={`${copy.cfop.selected}: ${current.id}`} /><div className="flex flex-col gap-3 self-center"><h3 className="t-subheading mono">{current.id}</h3><p className="t-notation break-words">{alg.alg}</p><p className="t-meta text-quiet">{copy.cfop.generated} · {alg.etm} {copy.common.moves}</p><p className="t-body text-quiet"><strong>{copy.cfop.oh}.</strong> {copy.cfop.noOh}</p></div></div>}
  </section>;
}
