"use client";

import { isFixedCentre, pieceContext, type NetCell } from "./cube-state";

/** Net layout: U on top, then L F R B, D below (the engine's FACES order and Speffz's). */
const ORIGIN: Record<NetCell["slotFace"], readonly [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

export interface StickerNetProps {
  readonly cells: readonly NetCell[];
  readonly size?: number;
  /**
   * Slot indices being pointed at: full strength, with a ring, so the mark doesn't depend on colour.
   * The rest of each pointed-at piece is drawn in full colour as well (a corner's one colour fits four
   * positions; all its colours say which piece it is), the fixed centres never black out, and everything
   * else is blacked out (a solid grey sticker, never a dimmed colour, so it gives no colour away). Omit to show every sticker normally.
   */
  readonly highlight?: ReadonlySet<number>;
  /** Letters to print on slots, by slot index. */
  readonly letters?: ReadonlyMap<number, string>;
  readonly label: string;
  readonly className?: string;
}

/**
 * A flat sticker net in SVG, coloured from the palette tokens. Used where a 3D cube isn't needed or
 * can't load, and as the always-available fallback. The description is on the element as its label.
 */
export function StickerNet({ cells, size = 3, highlight, letters, label, className }: StickerNetProps) {
  const cell = 10;
  const gap = 1;
  const facePx = size * cell;
  const width = facePx * 4 + gap * 3;
  const height = facePx * 3 + gap * 2;
  const context = highlight === undefined ? undefined : pieceContext(cells, highlight);
  const position = (c: NetCell) => {
    const [fx, fy] = ORIGIN[c.slotFace];
    return { x: fx * (facePx + gap) + c.col * cell, y: fy * (facePx + gap) + c.row * cell };
  };
  return (
    <svg role="img" aria-label={label} viewBox={`-2 -2 ${width + 4} ${height + 4}`} className={className}>
      {cells.map((c) => {
        const { x, y } = position(c);
        const faded = highlight !== undefined && !highlight.has(c.index) && context?.has(c.index) !== true && !isFixedCentre(c, size);
        const letter = letters?.get(c.index);
        return (
          <g key={c.index}>
            <rect x={x} y={y} width={cell} height={cell} fill="var(--cube-body)" />
            <rect x={x + 0.6} y={y + 0.6} width={cell - 1.2} height={cell - 1.2} rx={1} fill={faded ? "var(--sticker-off)" : `var(--face-${c.colour.toLowerCase()})`} />
            {letter !== undefined ? (
              <text x={x + cell / 2} y={y + cell / 2 + 2.2} textAnchor="middle" fontSize={6} fontWeight={700} fill={faded ? "var(--face-u)" : "var(--cube-body)"} style={{ fontVariationSettings: '"CASL" 1' }}>
                {letter}
              </text>
            ) : null}
          </g>
        );
      })}
      {/* Rings go on last so no neighbouring sticker paints over them. Dark inside light: one of the two shows on any sticker colour. */}
      {highlight === undefined ? null : cells.filter((c) => highlight.has(c.index)).map((c) => {
        const { x, y } = position(c);
        return (
          <g key={`ring-${String(c.index)}`} data-ring="true" aria-hidden>
            <rect x={x + 1.5} y={y + 1.5} width={cell - 3} height={cell - 3} rx={0.8} fill="none" stroke="var(--cube-body)" strokeWidth={1} />
            <rect x={x + 2.4} y={y + 2.4} width={cell - 4.8} height={cell - 4.8} rx={0.4} fill="none" stroke="var(--face-u)" strokeWidth={0.7} />
          </g>
        );
      })}
    </svg>
  );
}
