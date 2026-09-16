"use client";

import { drillScramble, expandNodes, formatMoves, invertNodes, parseAlg } from "@bld/cube-engine";
import { useMemo } from "react";
import { Cube } from "@/components/cube/cube";
import { LetterNotch } from "@/components/letters/letters";
import { algDatasets } from "@/content/algs";
import { en } from "@/i18n/en";
import { useReader } from "@/lib/reader";
import { misplacedPieces } from "@/trainers/effects";
import { mistakeFor, type MistakeKind } from "@/trainers/lesson-items";
import { piecesOf } from "@/lib/cube-highlights";

/**
 * Interactive pieces for 3BLD lessons 16–23: M2 shots and its tempting setups, commutators part by part,
 * 3-style cases, and what a solve with one mistake leaves on the cube. All from the verified datasets;
 * lessons.test.ts checks every prop.
 */

const copy = en.lessonExtra;
const Loading = () => <p className="t-meta text-quiet">{copy.loading}</p>;

function undoOf(setup: string): string {
  const parsed = parseAlg("3x3x3", setup);
  return parsed.ok ? formatMoves(expandNodes(invertNodes(parsed.value.nodes))) : "";
}

/** One M2 target from the verified dataset: setup, M2 and undo, or a special case's own alg. `<M2Shot target="UR" />` */
export function M2Shot({ target }: { target: string }) {
  const reader = useReader();
  const { m2Edges } = algDatasets();
  const record = m2Edges.records.find((r) => r.target === target);
  const alg = record?.algs[0];
  const drill = reader === undefined || alg === undefined ? undefined : drillScramble(reader.puzzle, alg.moves);
  if (reader === undefined || record === undefined || alg === undefined || drill?.ok !== true) return <Loading />;
  const letter = reader.letterOf(target) ?? "?";
  const special = record.kind === "special";
  const rule = m2Edges.oddStepRule.find((r) => r.target === target);
  const lit = piecesOf(reader, [m2Edges.buffer, target, m2Edges.swap.swapSticker]);
  return (
    <div className="my-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Cube setup={drill.value.scramble} alg={alg.moves} highlight={lit} controls label={special ? copy.m2SpecialLabel(target, letter) : copy.m2ShotLabel(target, letter)} />
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 self-center">
        <dt className="t-meta text-quiet">{copy.target}</dt>
        <dd className="flex items-baseline gap-2">
          <span className="t-notation">{target}</span>
          <LetterNotch letter={letter} face={reader.faceOf(target)} />
        </dd>
        {record.kind === "special" ? (
          <>
            <dt className="t-meta text-quiet">{copy.alg}</dt>
            <dd className="t-notation">{alg.alg}</dd>
          </>
        ) : (
          <>
            <dt className="t-meta text-quiet">{copy.setup}</dt>
            <dd className="t-notation">{record.setup === "" ? copy.none : record.setup}</dd>
            <dt className="t-meta text-quiet">{copy.swap}</dt>
            <dd className="t-notation">{m2Edges.swap.alg}</dd>
            <dt className="t-meta text-quiet">{copy.undo}</dt>
            <dd className="t-notation">{record.setup === "" ? copy.none : undoOf(record.setup)}</dd>
          </>
        )}
        {rule !== undefined ? <dd className="col-span-2 t-body">{copy.oddRule(target, rule.shootAs)}</dd> : null}
      </dl>
    </div>
  );
}

/** A tempting M2 setup from the dataset, run with M2 and the undo, with the damage lit. `<M2Tempting target="UR" />` */
export function M2Tempting({ target }: { target: string }) {
  const reader = useReader();
  const { m2Edges } = algDatasets();
  const tempting = m2Edges.tempting.find((t) => t.target === target);
  const record = m2Edges.records.find((r) => r.target === target);
  if (reader === undefined || tempting === undefined) return <Loading />;
  const moves = `${tempting.setup} ${m2Edges.swap.alg} ${undoOf(tempting.setup)}`;
  return (
    <div className="my-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Cube alg={moves} highlight={piecesOf(reader, tempting.damagedPieces)} controls label={copy.temptingLabel(tempting.setup, target)} />
      <div className="flex flex-col gap-2 self-center t-body">
        <p>{copy.tempting(tempting.setup, target)}</p>
        <p>{copy.temptingDamage(tempting.damagedPieces.join(", "))}</p>
        {record?.kind === "target" ? <p className="text-quiet">{copy.temptingLegal(record.setup)}</p> : null}
      </div>
    </div>
  );
}

export { CommParts, commParts } from "./comm-parts";

/** A 3-style case from the verified dataset, set up and solved by its comm. `<CommCase pieces="corners" case="UBR-UBL" />` */
export function CommCase({ pieces, case: caseId }: { pieces: "corners" | "edges"; case: string }) {
  const reader = useReader();
  const { threeStyleCorners, threeStyleEdges } = algDatasets();
  const dataset = pieces === "corners" ? threeStyleCorners : threeStyleEdges;
  const record = dataset.records.find((r) => r.id === caseId);
  const alg = record?.algs[0];
  const drill = reader === undefined || alg === undefined ? undefined : drillScramble(reader.puzzle, alg.moves);
  if (reader === undefined || record?.kind !== "cycle" || alg === undefined || drill?.ok !== true) return <Loading />;
  const [a, b] = record.targets;
  const letters = `${reader.letterOf(a) ?? "?"}${reader.letterOf(b) ?? "?"}`;
  return (
    <div className="my-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Cube setup={drill.value.scramble} alg={alg.moves} highlight={piecesOf(reader, [dataset.buffer, a, b])} controls label={copy.caseLabel(letters)} />
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 self-center">
        <dt className="t-meta text-quiet">{copy.target}</dt>
        <dd className="flex items-baseline gap-2">
          <span className="t-notation">
            {dataset.buffer} → {a} → {b}
          </span>
          <LetterNotch letter={reader.letterOf(a) ?? "?"} face={reader.faceOf(a)} />
          <LetterNotch letter={reader.letterOf(b) ?? "?"} face={reader.faceOf(b)} />
        </dd>
        <dt className="t-meta text-quiet">{copy.written}</dt>
        <dd className="t-notation">{alg.alg}</dd>
        <dt className="t-meta text-quiet">{copy.expanded}</dt>
        <dd className="t-notation">{alg.moves}</dd>
      </dl>
    </div>
  );
}

/** What an Old Pochmann solve with one mistake leaves on the cube, misplaced pieces lit. `<SolveMistake scramble="…" mistake="parity" />` */
export function SolveMistake({ scramble, mistake }: { scramble: string; mistake: MistakeKind }) {
  const reader = useReader();
  const shown = useMemo(() => {
    if (reader === undefined) return undefined;
    const { opCorners, opEdges, opParity } = algDatasets();
    const executed = mistakeFor(reader.puzzle, reader.scheme, { corners: opCorners, edges: opEdges, parity: opParity }, scramble, mistake);
    return executed === undefined ? undefined : `${scramble} ${executed}`;
  }, [reader, scramble, mistake]);
  if (reader === undefined || shown === undefined) return <Loading />;
  const { corners, edges } = misplacedPieces(reader.puzzle, shown);
  return (
    <div className="my-6 flex flex-col gap-2">
      <Cube setup={shown} highlight={piecesOf(reader, [...corners, ...edges])} dim="soft" label={copy.mistakeLabel(copy.mistakeNames[mistake])} className="max-w-[22rem] self-center" />
      <p className="t-meta text-center text-quiet">{copy.mistakePieces(corners.length + edges.length)}</p>
    </div>
  );
}
