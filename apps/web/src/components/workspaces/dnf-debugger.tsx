"use client";

import { useState, type SyntheticEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { workspaces as copy } from "@/i18n/workspaces";
import { useReader } from "@/lib/reader";
import { debugSolve, type DebugInput } from "@/trainers/dnf-debugger";

const initial: DebugInput = { scramble: "", memoEdges: "", memoCorners: "", recallEdges: "", recallCorners: "", executed: "", intended: "", orientation: false, parityOmitted: false };
export function DnfDebugger() {
  const reader = useReader();
  const [method, setMethod] = useState<"op" | "m2" | "threeStyle">("op");
  const [input, setInput] = useState(initial);
  const [result, setResult] = useState<ReturnType<typeof debugSolve>>();
  const [invalid, setInvalid] = useState(false);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (reader === undefined) return;
    try { const verdict = debugSolve(reader, reader.buffers[method], input); setResult(verdict); setInvalid(verdict === undefined); } catch { setInvalid(true); setResult(undefined); }
  };
  return <div className="flex flex-col gap-8">
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="t-ui flex flex-col gap-2 max-w-sm">{copy.debug.method}<select className="field" value={method} onChange={(event) => { setMethod(event.target.value as typeof method); }}><option value="op">OP/OP</option><option value="m2">M2/OP</option><option value="threeStyle">3-style</option></select></label>
      <div className="grid gap-4 md:grid-cols-2">{(["scramble", "memoEdges", "memoCorners", "recallEdges", "recallCorners", "executed", "intended"] as const).map((field) => <label key={field} className={`t-ui flex flex-col gap-2 ${field === "scramble" || field === "executed" || field === "intended" ? "md:col-span-2" : ""}`}>{copy.debug[field]}<textarea className="field mono w-full" rows={field === "executed" ? 4 : 2} value={input[field]} maxLength={10_000} onChange={(event) => { setInput({ ...input, [field]: event.target.value }); }} /></label>)}</div>
      <label className="t-body flex gap-3 items-center"><input type="checkbox" checked={input.orientation} onChange={(event) => { setInput({ ...input, orientation: event.target.checked }); }} />{copy.debug.orientation}</label>
      <label className="t-body flex gap-3 items-center"><input type="checkbox" checked={input.parityOmitted} onChange={(event) => { setInput({ ...input, parityOmitted: event.target.checked }); }} />{copy.debug.parity}</label>
      <button className="btn btn-strong self-start" type="submit" disabled={reader === undefined}>{copy.debug.action}</button>
    </form>
    {invalid ? <p role="alert" className="status-line">{copy.debug.invalid}</p> : null}
    {result === undefined ? null : <section className="flex flex-col gap-5" aria-label={copy.debug.evidence}>
      <h2 className="t-heading">{copy.debug.evidence}</h2>
      <p role="status" className="status-line">{result.solved ? copy.debug.solved : !result.hasExecution ? copy.debug.noMoves : copy.debug.findings.unknown}</p>
      <div className="trainer-surface"><Cube setup={result.replay.setup} alg={result.replay.alg} controls label={copy.debug.executed} /><div className="flex flex-col gap-4 self-center">
        {result.categories.map((category) => <div key={category}><h3 className="t-ui">{copy.debug.categories[category]}</h3><p className="t-body text-quiet mt-1">{copy.debug.findings[category]}</p></div>)}
        {result.differences.map((difference) => <p className="t-meta" key={difference.pieceType}>{copy.debug.difference(copy.common.pieces[difference.pieceType], difference.index, difference.expected, difference.actual)}</p>)}
        {result.differences.length > 0 ? <p className="t-meta text-quiet">{copy.debug.alternative}</p> : null}
        <h3 className="t-ui">{copy.debug.residual}</h3>{(["edges", "corners"] as const).map((type) => <p className="t-notation" key={type}>{copy.common.pieces[type]}: {result.residual[type].join(", ") || "0"}</p>)}
      </div></div>
      <details className="quiet-disclosure"><summary>{copy.debug.expected}</summary>{(["edges", "corners"] as const).map((type) => <p className="t-notation mt-3" key={type}>{copy.common.pieces[type]}: {result.traces[type].targets.join(" ")}</p>)}</details>
    </section>}
  </div>;
}
