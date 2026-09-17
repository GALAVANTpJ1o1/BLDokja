"use client";

import { useRef, useState } from "react";
import { Cube } from "@/components/cube/cube";
import { useSettings } from "@/components/settings/settings-provider";
import { en } from "@/i18n/en";

/**
 * Click a move, see it (BRIEF §6 lesson 3). Each press turns the cube by that move from where it is;
 * the moves so far are written out underneath. `<MoveExplorer moves="R R' U M E S Rw x y z" />`.
 */
export function MoveExplorer({ moves, label }: { moves: string; label: string }) {
  const { threeDRequested } = useSettings();
  const options = moves.split(/\s+/).filter(Boolean);
  const [history, setHistory] = useState<string[]>([]);
  const firstMove = useRef<HTMLButtonElement>(null);
  const last = history.at(-1);
  return (
    <div className="my-6 flex flex-col gap-3">
      <Cube key={history.length} setup={history.slice(0, -1).join(" ")} alg={last ?? ""} autoplay={threeDRequested} label={label} />
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={label}>
        {options.map((move, index) => (
          <button ref={index === 0 ? firstMove : undefined} key={move} type="button" className="btn t-notation min-w-12" onClick={() => { setHistory((h) => [...h, move]); }}>
            {move}
          </button>
        ))}
        <button type="button" className="btn" onClick={() => { if (history.length === 1) firstMove.current?.focus(); setHistory((h) => h.slice(0, -1)); }} disabled={history.length === 0}>
          {en.lesson.undoMove}
        </button>
        <button type="button" className="btn" onClick={() => { firstMove.current?.focus(); setHistory([]); }} disabled={history.length === 0}>
          {en.lesson.reset}
        </button>
      </div>
      <p className="t-notation text-center text-quiet" aria-live="polite">
        {history.length === 0 ? en.lesson.noMovesYet : history.join(" ")}
      </p>
    </div>
  );
}
