"use client";

import type { CaseSchedule } from "@bld/srs";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { caseStatus, masteryOpacity, MasteryMark } from "@/components/trainer/mastery";
import { en } from "@/i18n/en";
import type { Reader } from "@/lib/reader";
import type { CommCase } from "@/trainers/three-style";

/**
 * Every case at a glance (BRIEF §7.3), coloured by mastery with DESIGN.md's ramp and marks: first target
 * down the side, second along the top, cells on one piece left empty. Arrow keys move; Enter drills. On a
 * narrow screen, pick a first target and its cases are listed.
 */
export function CaseGrid({ reader, cases, stickers, schedules, now, current, onPick }: { reader: Reader; cases: readonly CommCase[]; stickers: readonly string[]; schedules: ReadonlyMap<string, CaseSchedule>; now: Date; current: string | undefined; onPick: (c: CommCase) => void }) {
  const byTargets = useMemo(() => new Map(cases.map((c) => [`${c.targets[0]}-${c.targets[1]}`, c])), [cases]);
  const [row, setRow] = useState(stickers[0] ?? "");
  const table = useRef<HTMLTableElement>(null);
  const pieceType = cases[0]?.pieceType ?? "corners";
  const letter = (s: string) => reader.letterOf(s) ?? "?";

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const move = moves[event.key];
    if (move === undefined || !(event.target instanceof HTMLElement) || event.target.dataset.cell === undefined) return;
    event.preventDefault();
    const [r = 0, c = 0] = event.target.dataset.cell.split("-").map(Number);
    // Skip same-piece gaps: keep stepping until a cell with a case, or the edge.
    let [nr, nc] = [r, c];
    for (let i = 0; i < stickers.length; i++) {
      nr = Math.min(stickers.length - 1, Math.max(0, nr + move[0]));
      nc = Math.min(stickers.length - 1, Math.max(0, nc + move[1]));
      const found = table.current?.querySelector<HTMLButtonElement>(`[data-cell="${String(nr)}-${String(nc)}"]`);
      if (found !== null && found !== undefined) {
        found.focus();
        return;
      }
    }
  };

  const cell = (c: CommCase) => {
    const schedule = schedules.get(c.id);
    const status = caseStatus(schedule, now);
    return { schedule, status };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden overflow-x-auto md:block">
        <table ref={table} className="border-collapse" aria-label={en.threeStyle.gridLabel(en.threeStyle.pieceTypes[pieceType])} onKeyDown={onKeyDown}>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-ground" />
              {stickers.map((s) => (
                <th key={s} scope="col" className="t-meta px-[1px] pb-1 text-center font-[600]" title={s}>
                  <span className="casual">{letter(s)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stickers.map((first, r) => (
              <tr key={first}>
                <th scope="row" className="t-meta sticky left-0 z-10 bg-ground pr-2 text-right font-[600]" title={first}>
                  <span className="casual">{letter(first)}</span>
                </th>
                {stickers.map((second, col) => {
                  const c = byTargets.get(`${first}-${second}`);
                  if (c === undefined) return <td key={second} className="p-[1px]" aria-hidden><span className="block h-7 w-7" /></td>;
                  const { schedule, status } = cell(c);
                  return (
                    <td key={second} className="p-[1px]">
                      <button
                        type="button"
                        data-cell={`${String(r)}-${String(col)}`}
                        tabIndex={current === c.id || (current === undefined && r === 0 && col === 1) ? 0 : -1}
                        onClick={() => { onPick(c); }}
                        aria-label={en.threeStyle.cellLabel(c.letters, `${c.targets[0]} ${c.targets[1]}`, en.trainer.mastery[status])}
                        aria-pressed={current === c.id}
                        className={`relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-[3px] border ${current === c.id ? "border-text" : "border-rule/60"}`}
                      >
                        <MasteryMark status={status} decorative />
                        <span aria-hidden className="absolute inset-0 bg-text" style={{ opacity: masteryOpacity(schedule) * 0.35 }} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex flex-wrap gap-1" role="group" aria-label={en.threeStyle.firstTarget}>
          {stickers.map((s) => (
            <button key={s} type="button" className="btn casual min-h-10 min-w-10 px-2" aria-pressed={row === s} aria-label={`${letter(s)}, ${s}`} onClick={() => { setRow(s); }}>
              {letter(s)}
            </button>
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-1">
          {cases
            .filter((c) => c.targets[0] === row)
            .map((c) => {
              const { status } = cell(c);
              return (
                <li key={c.id}>
                  <button type="button" className={`btn flex min-h-11 w-full items-center justify-between gap-2 px-2 ${current === c.id ? "btn-strong" : ""}`} onClick={() => { onPick(c); }}>
                    <span className="casual">{c.letters}</span>
                    <span className="t-meta flex items-center gap-1 text-quiet">
                      <MasteryMark status={status} decorative />
                      {en.trainer.mastery[status]}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}
