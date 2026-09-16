"use client";

import type { NetCell } from "./cube-state";

/** Net layout: U on top, then L F R B, D below (the engine's FACES order and Speffz's). */
const ORIGIN: Record<NetCell["slotFace"], readonly [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

export interface StickerNetProps {
  readonly cells: readonly NetCell[];
  readonly size?: number;
  /** Slot indices drawn at full strength; the rest are dimmed. Omit to show every sticker normally. */
  readonly highlight?: ReadonlySet<number>;
  readonly hideUnrevealed?: boolean;
  /** Letters to print on slots, by slot index. */
  readonly letters?: ReadonlyMap<number, string>;
  readonly label: string;
  readonly className?: string;
}

/**
 * A flat sticker net in SVG, coloured from the palette tokens. Used where a 3D cube isn't needed or
 * can't load, and as the always-available fallback. The description is on the element as its label.
 */
export function StickerNet({ cells, size = 3, highlight, hideUnrevealed = false, letters, label, className }: StickerNetProps) {
  const cell = 10;
  const gap = 1;
  const facePx = size * cell;
  const width = facePx * 4 + gap * 3;
  const height = facePx * 3 + gap * 2;
  return (
    <svg role="img" aria-label={label} viewBox={`-2 -2 ${width + 4} ${height + 4}`} className={className}>
      {cells.map((c) => {
        const [fx, fy] = ORIGIN[c.slotFace];
        const x = fx * (facePx + gap) + c.col * cell;
        const y = fy * (facePx + gap) + c.row * cell;
        const dim = highlight !== undefined && !highlight.has(c.index);
        const letter = letters?.get(c.index);
        return (
          <g key={c.index}>
            <rect x={x} y={y} width={cell} height={cell} fill="var(--cube-body)" />
            <rect x={x + 0.6} y={y + 0.6} width={cell - 1.2} height={cell - 1.2} rx={1} fill={dim && hideUnrevealed ? "var(--rule)" : `var(--face-${c.colour.toLowerCase()})`} opacity={dim ? 0.28 : 1} />
            {letter !== undefined ? (
              <text x={x + cell / 2} y={y + cell / 2 + 2.2} textAnchor="middle" fontSize={6} fontWeight={700} fill="var(--cube-body)" style={{ fontVariationSettings: '"CASL" 1' }}>
                {letter}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
