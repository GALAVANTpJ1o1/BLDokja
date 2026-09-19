"use client";

import type { LetterPair } from "@bld/storage";
import { useEffect, useMemo, useState } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { workspaces as copy } from "@/i18n/workspaces";
import { download } from "@/lib/download";
import { threeStyleForReader, useMethodData } from "@/lib/methods";
import { useReader } from "@/lib/reader";
import type { ReferenceDocument } from "@/lib/reference-pdf";
import { getStorage, nowIso } from "@/lib/storage-client";
import { commCases } from "@/trainers/three-style";

export function ReferenceSheet() {
  const reader = useReader();
  const built = useMethodData(reader, threeStyleForReader);
  const { stored, update } = useSettings();
  const [pairs, setPairs] = useState<LetterPair[]>();
  const [words, setWords] = useState(true);
  const [algs, setAlgs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void getStorage().letterPairs().then(setPairs).catch(() => { setMessage(copy.common.error); }); }, []);
  const preferred = useMemo(() => reader === undefined || built?.ok !== true ? [] : [built.value.corners, built.value.edges].flatMap((dataset) => commCases(reader.puzzle,dataset,reader.scheme,stored?.algOverrides).cases.filter((item) => item.algs[0]?.source === "yours").map((item) => ({ ...item, datasetId: dataset.id }))), [reader,built,stored?.algOverrides]);
  const document: ReferenceDocument | undefined = reader === undefined || pairs === undefined ? undefined : {
    title: copy.reference.heading,
    subtitle: `${copy.common.scheme}: ${reader.scheme.name} · ${copy.reference.generated}: ${nowIso().slice(0,10)}`,
    sections: [
      { heading: copy.common.buffer, rows: Object.entries(reader.buffers).map(([method,buffers]) => [method,buffers.corners,buffers.edges]) },
      ...(["corners","edges"] as const).map((type) => ({ heading: `${copy.common.scheme} · ${copy.common.pieces[type]}`, rows: Object.entries(reader.scheme.letters[type] ?? {}).map(([sticker,letter]) => [letter,sticker]) })),
      ...(words ? [{ heading: copy.reference.words, rows: pairs.flatMap((pair) => { const main = pair.images.find((image) => !image.flags?.includes("placeholder")); return main === undefined ? [] : [[pair.id,main.text]]; }) }] : []),
      ...(algs ? [{ heading: copy.reference.algs, rows: preferred.map((item) => [copy.common.pieces[item.pieceType], item.letters, item.buffer, item.recordId, item.algs[0]?.alg ?? "", item.algs[0]?.moves ?? "", stored?.physicalChecks?.[`${item.id}|${item.algs[0]?.alg}`] === undefined ? copy.reference.unchecked : copy.reference.checked]) }] : []),
    ],
    note: copy.reference.physicalNote,
  };
  const buildPdf = async () => {
    if (document === undefined || busy || algs && built?.ok !== true) return;
    setBusy(true); setMessage("");
    try { const { referencePdf } = await import("@/lib/reference-pdf"); const bytes = await referencePdf(document); download(new Blob([bytes], { type: "application/pdf" }),copy.reference.filename); }
    catch { setMessage(`${copy.common.error} ${copy.reference.unicode}`); }
    finally { setBusy(false); }
  };
  return <div className="flex flex-col gap-6">
    <div className="no-print flex flex-col gap-4">
      <div className="control-row" data-guide="reference-options"><label className="t-ui flex gap-2 items-center"><input type="checkbox" checked={words} onChange={(event) => { setWords(event.target.checked); }} />{copy.reference.words}</label><label className="t-ui flex gap-2 items-center"><input type="checkbox" checked={algs} onChange={(event) => { setAlgs(event.target.checked); }} />{copy.reference.algs}</label></div>
      <div className="control-row" data-guide="reference-actions"><button className="btn btn-strong" type="button" disabled={busy || document === undefined || algs && built === undefined} onClick={() => { void buildPdf(); }}>{busy ? copy.reference.preparing : copy.reference.download}</button><button className="btn" type="button" onClick={() => { window.print(); }}>{copy.reference.print}</button></div>
      {message || algs && built?.ok === false ? <p role="alert" className="status-line">{message || copy.common.error}</p> : null}
    </div>
    <article className="reference-sheet flex flex-col gap-6" aria-label={copy.reference.preview} data-guide="reference-sheet">
      {document === undefined ? <p role="status">{copy.common.loading}</p> : <><header><h2 className="t-heading">{document.title}</h2><p className="t-meta text-quiet mt-2">{document.subtitle}</p></header>{document.sections.map((section) => <section className="flex flex-col gap-3" key={section.heading}><h3 className="t-ui">{section.heading}</h3><div className="data-table-wrap"><table className="data-table" aria-label={section.heading}><tbody>{section.rows.map((row,index) => <tr key={index}>{row.map((cell,column) => column === 0 ? <th className="mono whitespace-nowrap" scope="row" key={column}>{cell}</th> : <td className="t-notation break-words" key={column}>{cell}</td>)}</tr>)}</tbody></table></div></section>)}<p className="t-meta text-quiet">{document.note}</p></>}
    </article>
    <section className="no-print flex flex-col gap-4 border-t border-rule pt-6"><h2 className="t-heading">{copy.reference.verify}</h2><p className="t-body text-quiet">{copy.reference.physicalNote}</p>
      {preferred.length === 0 ? <p className="t-meta">{copy.reference.noAlgs}</p> : preferred.map((item) => {
        const key = `${item.id}|${item.algs[0]?.alg}`;
        return <label className="t-meta flex gap-3 items-start" key={key}><input type="checkbox" checked={stored?.physicalChecks?.[key] !== undefined} onChange={(event) => { const checks = Object.fromEntries(Object.entries(stored?.physicalChecks ?? {}).filter(([id]) => id !== key)); if (event.target.checked) checks[key] = nowIso(); void update({ physicalChecks: checks }).catch(() => { setMessage(copy.common.error); }); }} /><span>{item.letters} · {item.recordId} · {item.algs[0]?.alg}<span className="block text-quiet">{copy.reference.checked}</span></span></label>;
      })}
    </section>
  </div>;
}
