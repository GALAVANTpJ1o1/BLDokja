"use client";

import { expandNodes, formatAlg, formatMoves, invertNodes, parseAlg, type AlgNode } from "@bld/cube-engine";
import { useMemo, useState } from "react";
import { Cube } from "@/components/cube/cube";
import { en } from "@/i18n/en";
import { useReader } from "@/lib/reader";
import { piecesOf } from "@/lib/cube-highlights";
import { misplacedPieces } from "@/trainers/effects";
const copy = en.lessonExtra;
const Loading = () => <p className="t-meta text-quiet">{copy.loading}</p>;

interface Part {
  readonly name: string;
  readonly nodes: readonly AlgNode[];
}

/** A comm's parts in the order they're done: [A, B] is A, B, A undone, B undone; [S: [A, B]] adds S before and after. */
export function commParts(text: string): Part[] | undefined {
  const parsed = parseAlg("3x3x3", text);
  const [top] = parsed.ok ? parsed.value.nodes : [];
  if (!parsed.ok || parsed.value.nodes.length !== 1 || top === undefined) return undefined;
  const comm = top.type === "conjugate" ? top.body : [top];
  const [inner] = comm;
  if (comm.length !== 1 || inner?.type !== "commutator") return undefined;
  const middle: Part[] = [
    { name: copy.parts.a, nodes: inner.a },
    { name: copy.parts.b, nodes: inner.b },
    { name: copy.parts.aInverse, nodes: invertNodes(inner.a) },
    { name: copy.parts.bInverse, nodes: invertNodes(inner.b) },
  ];
  return top.type === "conjugate" ? [{ name: copy.parts.setup, nodes: top.setup }, ...middle, { name: copy.parts.setupInverse, nodes: invertNodes(top.setup) }] : middle;
}

/** A commutator done one part at a time from a solved cube, with the three pieces it cycles lit throughout. */
export function CommParts({ comm }: { comm: string }) {
  const reader = useReader();
  const parts = useMemo(() => commParts(comm), [comm]);
  const [index, setIndex] = useState(-1);
  if (reader === undefined || parts === undefined) return <Loading />;
  const all = formatMoves(parts.flatMap((p) => expandNodes(p.nodes)));
  const { corners, edges } = misplacedPieces(reader.puzzle, all);
  const lit = piecesOf(reader, [...corners, ...edges]);
  const part = index >= 0 ? parts[index] : undefined;
  const before = formatMoves(parts.slice(0, Math.max(0, index)).flatMap((p) => expandNodes(p.nodes)));
  return (
    <div className="my-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Cube key={index} setup={before} alg={part === undefined ? "" : formatMoves(expandNodes(part.nodes))} highlight={lit} controls={part !== undefined} autoplay={part !== undefined} label={copy.commLabel(comm)} />
      <div className="flex flex-col gap-3 self-center">
        <p className="t-notation">{comm}</p>
        <ol className="flex flex-col gap-1">
          {parts.map((p, i) => (
            <li key={`${p.name}-${String(i)}`} className={`t-body ${i === index ? "font-[650]" : i < index ? "" : "text-quiet"}`}>
              {p.name}: <span className="t-notation">{formatAlg({ puzzle: "3x3x3", nodes: p.nodes })}</span>
            </li>
          ))}
        </ol>
        <p className="t-body" aria-live="polite">{part === undefined ? copy.commStart(parts.length) : index === parts.length - 1 ? copy.commDone : copy.partOf(index + 1, parts.length, part.name)}</p>
        <div className="flex gap-2">
          <button type="button" className="btn" disabled={index < 0} onClick={() => { setIndex((i) => i - 1); }}>{copy.previous}</button>
          <button type="button" className="btn btn-strong" disabled={index >= parts.length - 1} onClick={() => { setIndex((i) => i + 1); }}>{copy.next}</button>
        </div>
      </div>
    </div>
  );
}

