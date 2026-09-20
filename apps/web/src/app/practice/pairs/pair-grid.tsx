"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { en } from "@/i18n/en";
import { useDragScroll } from "@/components/ui/use-drag-scroll";
import { mainImage } from "@/trainers/pairs";
import { masteryOpacity, MasteryMark, pairStatus, type LibraryContext } from "./pair-ui";

/**
 * The 24 × 24 overview (AUDIT §6, Q4: kept, redesigned for small screens). On wide screens a table with
 * the first letter down the side; arrow keys move between cells and Enter opens one. On narrow screens,
 * pick a first letter and the 24 pairs starting with it are listed.
 */
export function PairGrid({ ctx }: { ctx: LibraryContext }) {
  const [focus, setFocus] = useState<[number, number]>([0, 1]);
  const scroller = useRef<HTMLDivElement>(null);
  useDragScroll(scroller);
  const [row, setRow] = useState(ctx.letters[0] ?? "");
  const table = useRef<HTMLTableElement>(null);
  const size = ctx.letters.length;

  const cell = (first: string, second: string) => {
    const id = `${first}${second}`;
    const pair = ctx.byId.get(id);
    const word = mainImage(pair)?.text;
    const schedule = ctx.schedules.get(id);
    const status = pairStatus(schedule, ctx.now);
    return { id, pair, word, schedule, status, placeholder: pair?.images.some((i) => i.flags?.includes("placeholder") === true) === true };
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Home: [0, -size], End: [0, size] };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    // Read the position from the focused cell, not state, so presses faster than a render still add up.
    const [r = focus[0], c = focus[1]] = event.target instanceof HTMLElement && event.target.dataset.cell !== undefined ? event.target.dataset.cell.split("-").map(Number) : focus;
    const next: [number, number] = [Math.min(size - 1, Math.max(0, r + move[0])), Math.min(size - 1, Math.max(0, c + move[1]))];
    setFocus(next);
    table.current?.querySelector<HTMLButtonElement>(`[data-cell="${String(next[0])}-${String(next[1])}"]`)?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="t-meta text-quiet">{en.pairs.keyboard}</p>
      <div ref={scroller} className="drag-scroll hidden overflow-x-auto md:block">
        <table ref={table} className="border-collapse" aria-label={en.pairs.gridLabel} onKeyDown={onKeyDown}>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-ground" />
              {ctx.letters.map((l) => (
                <th key={l} scope="col" className="t-meta mono px-1 pb-1 text-center font-[600]">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ctx.letters.map((first, r) => (
              <tr key={first}>
                <th scope="row" className="t-meta mono sticky left-0 z-10 bg-ground pr-2 text-right font-[600]">
                  {first}
                </th>
                {ctx.letters.map((second, c) => {
                  const info = cell(first, second);
                  const diagonal = first === second;
                  const picture = mainImage(ctx.byId.get(info.id))?.asset;
                  return (
                    <td key={second} className="p-[1px]">
                      <button
                        type="button"
                        data-cell={`${String(r)}-${String(c)}`}
                        tabIndex={focus[0] === r && focus[1] === c ? 0 : -1}
                        onFocus={() => { setFocus([r, c]); }}
                        onClick={() => { ctx.openEditor(info.id); }}
                        aria-label={en.pairs.cellLabel(info.id, info.word, en.pairs.mastery[info.status])}
                        title={diagonal ? `${info.id} · ${en.pairs.diagonal}` : `${info.id} · ${info.word ?? en.pairs.empty}`}
                        className={`relative flex h-10 w-[4.75rem] flex-col justify-between overflow-hidden rounded-[4px] border px-1 pt-[2px] text-left ${info.word === undefined ? "border-dashed border-rule" : "border-rule/60"} ${diagonal ? "bg-stage" : ""}`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="mono text-[0.625rem] leading-none text-quiet">{info.id}</span>
                          <MasteryMark status={info.status} />
                        </span>
                        <span className="flex min-w-0 items-center gap-1">
                          {picture === undefined ? null : <img src={picture} alt="" className="h-3.5 w-3.5 shrink-0 rounded-[2px] object-cover" />}
                          <span className={`truncate text-[0.75rem] leading-tight ${info.word === undefined ? "text-quiet" : ""}`}>{info.word ?? (info.placeholder ? en.pairs.placeholder : "")}</span>
                        </span>
                        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-text" style={{ opacity: masteryOpacity(info.schedule) }} />
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
        <div className="flex flex-wrap gap-1" role="group" aria-label={en.pairs.firstLetter}>
          {ctx.letters.map((l) => (
            <button key={l} type="button" className="btn mono min-h-10 min-w-10 px-2" aria-pressed={row === l} onClick={() => { setRow(l); }}>
              {l}
            </button>
          ))}
        </div>
        <ul className="flex flex-col">
          {ctx.letters.map((second) => {
            const info = cell(row, second);
            return (
              <li key={second} className="border-t border-rule">
                <button type="button" className="relative flex min-h-12 w-full items-center gap-3 py-2 text-left" onClick={() => { ctx.openEditor(info.id); }}>
                  <span className="mono w-8 font-[600]">{info.id}</span>
                  <span className={`min-w-0 flex-1 truncate ${info.word === undefined ? "text-quiet" : ""}`}>{info.word ?? (info.placeholder ? en.pairs.placeholder : en.pairs.empty)}</span>
                  <span className="t-meta flex items-center gap-1 text-quiet">
                    <MasteryMark status={info.status} decorative />
                    {en.pairs.mastery[info.status]}
                  </span>
                  <span aria-hidden className="absolute bottom-0 left-0 h-[3px] w-8 bg-text" style={{ opacity: masteryOpacity(info.schedule) }} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
