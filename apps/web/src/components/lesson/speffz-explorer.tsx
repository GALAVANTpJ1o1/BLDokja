"use client";

import { useMemo, useState } from "react";
import { netCells } from "@/components/cube/cube-state";
import { LetterTile } from "@/components/letters/letters";
import { en } from "@/i18n/en";
import { useReader } from "@/lib/reader";

const ORIGIN: Record<"U" | "L" | "F" | "R" | "B" | "D", readonly [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

/**
 * The lettering scheme on a clickable net (BRIEF §6 lesson 4: "an interactive sticker-clicking
 * trainer, not a diagram"). Letters come from the reader's scheme. Choose corners or edges; press a
 * sticker to hear its name and letter.
 */
export function SpeffzExplorer({ pieces = "corners" }: { pieces?: "corners" | "edges" }) {
  const reader = useReader();
  const [type, setType] = useState<"corners" | "edges">(pieces);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const cells = useMemo(() => (reader === undefined ? [] : netCells(reader.puzzle, reader.puzzle.kpuzzle.defaultPattern())), [reader]);
  if (reader === undefined) return <p className="t-meta text-quiet">{en.cube.loading}</p>;

  const pickedLetter = picked === undefined ? undefined : reader.letterOf(picked);
  return (
    <div className="my-6 flex flex-col gap-4">
      <div className="flex gap-2" role="group" aria-label={en.lesson.pieceTypeChoice}>
        {(["corners", "edges"] as const).map((t) => (
          <button key={t} type="button" className="btn" aria-pressed={type === t} onClick={() => { setType(t); setPicked(undefined); }}>
            {en.lesson.pieces[t]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-[2px] self-center rounded-[4px] bg-body p-1" style={{ width: "min(100%, 34rem)" }}>
        {cells.map((c) => {
          const [fx, fy] = ORIGIN[c.slotFace];
          const name = reader.nameOf(c.index);
          const ofType = reader.pieceTypeOf(name) === type;
          const letter = ofType ? reader.letterOf(name) : undefined;
          return (
            <button
              key={c.index}
              type="button"
              disabled={!ofType}
              aria-label={ofType ? `${name}, ${letter ?? ""}` : undefined}
              aria-pressed={picked === name}
              onClick={() => { setPicked(name); }}
              className={`aspect-square rounded-[2px] t-ui font-[700] casual disabled:cursor-default ${picked === name ? "outline-2 outline-offset-1 outline-[var(--focus)]" : ""}`}
              style={{ gridColumn: fx * 3 + c.col + 1, gridRow: fy * 3 + c.row + 1, background: `var(--face-${c.colour.toLowerCase()})`, color: "var(--cube-body)", opacity: ofType ? 1 : 0.35 }}
            >
              {letter}
            </button>
          );
        })}
      </div>
      <p className="flex min-h-[72px] items-center gap-4 t-body" aria-live="polite">
        {picked !== undefined && pickedLetter !== undefined ? (
          <>
            <LetterTile letter={pickedLetter} face={reader.faceOf(picked)} />
            <span>{en.lesson.stickerIs(picked, pickedLetter, en.cube.faceNames[reader.faceOf(picked)])}</span>
          </>
        ) : (
          <span className="text-quiet">{en.lesson.pickASticker}</span>
        )}
      </p>
    </div>
  );
}
