"use client";

import { useMemo } from "react";
import type { Reader } from "@/lib/reader";
import { piecesOf } from "@/lib/cube-highlights";
import { en } from "@/i18n/en";
import { explore } from "@/i18n/explore";
import { netCells, patternFor } from "./cube-state";

/** All colours of the physical cubie in a slot, with the asked-for face outlined. */
export function PieceColours({ reader, scramble, slot }: { reader: Reader; scramble: string; slot: string }) {
  const cells = useMemo(() => {
    const state = patternFor(reader.puzzle, scramble);
    const names = new Set(piecesOf(reader, [slot]));
    return state === undefined ? [] : netCells(reader.puzzle, state).filter(c => names.has(reader.nameOf(c.index)));
  }, [reader, scramble, slot]);
  return <div className="flex flex-col gap-3">
    <p className="t-meta text-quiet">{explore.wholePiece}</p>
    <div className="flex gap-3" role="group" aria-label={explore.wholePiece}>
      {cells.map(c => <div key={c.index} className="flex flex-col items-center gap-2">
        <span className="grid h-16 w-16 place-items-center rounded-lg border-4" style={{ background: `var(--face-${c.colour.toLowerCase()})`, borderColor: reader.nameOf(c.index) === slot ? "var(--text)" : "var(--cube-body)", color: "var(--cube-body)" }}>
          <span className="t-subheading">{reader.nameOf(c.index) === slot ? "?" : ""}</span>
        </span>
        <span className="t-meta">{en.cube.colourNames[c.colour]}<br />{c.slotFace}</span>
      </div>)}
    </div>
  </div>;
}
