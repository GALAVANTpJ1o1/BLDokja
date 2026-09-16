"use client";

import { cancelMoves, expandNodes, formatMoves, invertMoves, parseAlg, type AlgNode } from "@bld/cube-engine";
import { useMemo, useState } from "react";
import { Cube } from "@/components/cube/cube";
import { workspaces as copy } from "@/i18n/workspaces";
import type { Reader } from "@/lib/reader";
import { misplacedPieces } from "@/trainers/effects";

interface Part { label: string; moves: string }
function partsOf(nodes: readonly AlgNode[]): Part[] | undefined {
  const node = nodes.length === 1 ? nodes[0] : undefined;
  if (node?.type === "conjugate") {
    const body = partsOf(node.body);
    if (body === undefined) return undefined;
    const setup = expandNodes(node.setup);
    return [{ label: copy.algs.setup, moves: formatMoves(setup) }, ...body, { label: copy.algs.undo, moves: formatMoves(invertMoves(setup)) }];
  }
  if (node?.type !== "commutator") return undefined;
  const a = expandNodes(node.a); const b = expandNodes(node.b);
  return [{ label: copy.algs.interchange, moves: formatMoves(a) }, { label: copy.algs.insertion, moves: formatMoves(b) }, { label: copy.algs.inverseA, moves: formatMoves(invertMoves(a)) }, { label: copy.algs.inverseB, moves: formatMoves(invertMoves(b)) }];
}
export function WhyAlg({ reader, alg, setup = "" }: { reader: Reader; alg: string; setup?: string }) {
  const [part, setPart] = useState(0);
  const analysis = useMemo(() => {
    const parsed = parseAlg(reader.puzzle.id, alg);
    if (!parsed.ok) return undefined;
    const expanded = expandNodes(parsed.value.nodes);
    const cancelled = cancelMoves(reader.puzzle.id, expanded);
    return { expanded, cancelled, parts: partsOf(parsed.value.nodes), affected: misplacedPieces(reader.puzzle, formatMoves(cancelled)) };
  }, [reader, alg]);
  if (analysis === undefined) return null;
  const current = analysis.parts?.[Math.min(part, analysis.parts.length - 1)];
  const before = analysis.parts?.slice(0, part).map((item) => item.moves).join(" ") ?? "";
  return <div className="flex flex-col gap-4">
    <p className="t-meta text-quiet">{copy.algs.whyIntro}</p>
    <p className="t-meta">{copy.algs.cancellation(analysis.expanded.length, analysis.cancelled.length)}</p>
    <p className="t-notation break-words">{formatMoves(analysis.cancelled)}</p>
    <p className="t-meta">{copy.algs.affected}: {[...analysis.affected.corners, ...analysis.affected.edges].join(", ") || "0"}</p>
    {analysis.parts === undefined ? <p className="t-meta text-quiet">{copy.algs.plain}</p> : <>
      <p className="t-meta text-quiet">{copy.algs.decomposition}</p>
      <div className="control-row">{analysis.parts.map((item, index) => <button type="button" className="btn t-meta" key={index} aria-pressed={part === index} onClick={() => { setPart(index); }}>{item.label}</button>)}</div>
      {current === undefined ? null : <><p className="t-notation">{current.label}: {current.moves}</p><Cube key={`${alg}:${part}`} setup={`${setup} ${before}`} alg={current.moves} controls label={current.label} /><p className="t-meta">{copy.debug.residual}: {Object.values(misplacedPieces(reader.puzzle, current.moves)).flat().join(", ")}</p></>}
    </>}
  </div>;
}
