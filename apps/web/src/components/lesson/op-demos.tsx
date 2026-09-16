"use client";

import { cancelMoves, drillScramble, expandNodes, formatMoves, invertMoves, parseAlg, type OpSetupsDataset } from "@bld/cube-engine";
import { useMemo } from "react";
import { Cube } from "@/components/cube/cube";
import { LetterNotch } from "@/components/letters/letters";
import { algDatasets } from "@/content/algs";
import { en } from "@/i18n/en";
import { useReader } from "@/lib/reader";

function datasetFor(pieces: "corners" | "edges"): OpSetupsDataset {
  const { opCorners, opEdges } = algDatasets();
  return pieces === "corners" ? opCorners : opEdges;
}

export function piecesOf(reader: NonNullable<ReturnType<typeof useReader>>, names: readonly string[]): string[] {
  return reader.puzzle.geometry.stickers.map((s) => reader.nameOf(s.index)).filter((name) => names.some((piece) => sameCubie(name, piece)));
}

/** A sticker belongs to a piece if it has the same faces, in any order ("FUR" is on piece "UFR"). */
function sameCubie(sticker: string, piece: string): boolean {
  return sticker.length === piece.length && Array.from(sticker).sort().join("") === Array.from(piece).sort().join("");
}

/** The swap alg a method uses, straight from the verified dataset. */
export function SwapAlg({ pieces }: { pieces: "corners" | "edges" }) {
  return <code className="t-notation rounded-[2px] bg-stage px-1">{datasetFor(pieces).swap.alg}</code>;
}

/**
 * One Old Pochmann target from the verified dataset: its setup, the swap, and the undo, animated on a
 * cube where only the buffer, the target and the swap's side-effect pieces are lit.
 * `<OpShot pieces="corners" target="UFR" />`
 */
export function OpShot({ pieces, target }: { pieces: "corners" | "edges"; target: string }) {
  const reader = useReader();
  const dataset = datasetFor(pieces);
  const record = dataset.records.find((r) => r.target === target);
  const alg = record?.algs[0];
  const drill = reader === undefined || alg === undefined ? undefined : drillScramble(reader.puzzle, alg.moves);
  const scene = drill?.ok === true ? { setup: drill.value.scramble } : undefined;
  if (reader === undefined || record === undefined || alg === undefined || scene === undefined) return <p className="t-meta text-quiet">{en.cube.loading}</p>;

  const setupParsed = parseAlg("3x3x3", record.setup);
  const undo = setupParsed.ok ? formatMoves(invertMoves(cancelMoves("3x3x3", expandNodes(setupParsed.value.nodes)))) : "";
  const lit = piecesOf(reader, [dataset.buffer, target, ...dataset.swap.sideEffectPieces]);
  const letter = reader.letterOf(target) ?? "?";
  return (
    <div className="my-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Cube setup={scene.setup} alg={alg.moves} highlight={lit} controls label={en.lesson.opShotLabel(target, letter)} />
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 self-center">
        <dt className="t-meta text-quiet">{en.lesson.target}</dt>
        <dd className="flex items-baseline gap-2">
          <span className="t-notation">{target}</span>
          <LetterNotch letter={letter} face={reader.faceOf(target)} />
        </dd>
        <dt className="t-meta text-quiet">{en.lesson.setup}</dt>
        <dd className="t-notation">{record.setup === "" ? en.lesson.noSetup : record.setup}</dd>
        <dt className="t-meta text-quiet">{en.lesson.swap}</dt>
        <dd className="t-notation">{dataset.swap.alg}</dd>
        <dt className="t-meta text-quiet">{en.lesson.undo}</dt>
        <dd className="t-notation">{undo === "" ? en.lesson.noSetup : undo}</dd>
      </dl>
    </div>
  );
}

/**
 * "Why is this setup illegal?" (BRIEF §7.2), from the dataset's own worked example for a forbidden
 * move: the tempting setup is run with the swap and undo, and the pieces it damages are lit.
 * `<IllegalSetup pieces="corners" family="U" />`
 */
export function IllegalSetup({ pieces, family }: { pieces: "corners" | "edges"; family: string }) {
  const reader = useReader();
  const dataset = datasetFor(pieces);
  const forbidden = dataset.forbidden.find((f) => f.family === family);
  const moves = useMemo(() => {
    if (forbidden === undefined) return undefined;
    const setup = parseAlg("3x3x3", forbidden.example.setup);
    const swap = parseAlg("3x3x3", dataset.swap.alg);
    if (!setup.ok || !swap.ok) return undefined;
    const s = expandNodes(setup.value.nodes);
    return formatMoves([...s, ...expandNodes(swap.value.nodes), ...invertMoves(s)]);
  }, [forbidden, dataset]);
  if (reader === undefined || forbidden === undefined || moves === undefined) return <p className="t-meta text-quiet">{en.cube.loading}</p>;
  const lit = piecesOf(reader, forbidden.example.damagedPieces);
  return (
    <div className="my-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Cube alg={moves} highlight={lit} controls label={en.lesson.illegalLabel(forbidden.example.setup, forbidden.example.target)} />
      <div className="flex flex-col gap-2 self-center t-body">
        <p>{en.lesson.illegalSetup(forbidden.example.setup, forbidden.example.target)}</p>
        <p>{en.lesson.illegalDisturbs(family, forbidden.disturbs.join(", "))}</p>
        <p className="text-quiet">{en.lesson.illegalDamaged(forbidden.example.damagedPieces.join(", "))}</p>
      </div>
    </div>
  );
}

/** The parity alg from the verified dataset, Old Pochmann's or M2/OP's, animated from solved with its pieces lit. */
export function ParityAlg({ method = "op" }: { method?: "op" | "m2" }) {
  const reader = useReader();
  const { opParity, m2opParity } = algDatasets();
  const record = (method === "m2" ? m2opParity : opParity).records[0];
  const alg = record.algs[0];
  if (reader === undefined || alg === undefined) return <p className="t-meta text-quiet">{en.cube.loading}</p>;
  const stickers = record.intendedEffect.stickerCycles.flat();
  const lit = piecesOf(reader, stickers);
  return (
    <div className="my-6 flex flex-col gap-3">
      <p className="t-notation text-center">{alg.alg}</p>
      <Cube alg={alg.moves} highlight={lit} controls label={en.lesson.parityLabel} />
    </div>
  );
}
