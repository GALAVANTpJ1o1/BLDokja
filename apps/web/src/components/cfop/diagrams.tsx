import type { ReactElement } from "react";
import type { CubeRenderMode } from "@bld/cube-engine";
import type { Side } from "@/i18n/cfop";
import type { Colour, IsoData, TopDiagram } from "@/lib/cfop-views";

/**
 * Lightweight recognition diagrams, plain SVG with no cube engine (polish brief §53, §79). Sticker colours are the
 * site's `--face-*` tokens, so a colourblind palette and the CFOP orientation profile recolour them like every other
 * cube. What is drawn depends on the render mode, so a page never decides that itself:
 *
 *   OLL_EDGE_RECOGNITION  only the top centre and the four top edges; corners are outlined, nothing else drawn
 *   OLL_FULL_RECOGNITION  the whole top face, and the side stickers that show the top colour
 *   PLL_RECOGNITION       the top face is done, so it is quiet; the side colours around it are what carries the case
 */
const CELL = 22;
const STRIP = 9;
const GAP = 2;
const PAD = 5;
const X0 = PAD + STRIP + GAP;
const SIZE = X0 + 3 * CELL + GAP + STRIP + PAD;

const face = (colour: Colour) => `var(--face-${colour.toLowerCase()})`;
const OFF = "var(--sticker-off)";

export interface DiagramProps {
  readonly diagram: TopDiagram;
  readonly mode: Extract<CubeRenderMode, "OLL_EDGE_RECOGNITION" | "OLL_FULL_RECOGNITION" | "PLL_RECOGNITION">;
  /** What a screen reader hears instead of the picture. */
  readonly label: string;
  /** A letter printed on each side sticker in PLL mode, so the colour is not the only cue. */
  readonly letters?: Readonly<Record<Colour, string>>;
  /** Sides that carry a bar or headlights: marked with an outline (a shape, so it works without colour). */
  readonly bars?: readonly Side[];
  readonly headlights?: readonly Side[];
  readonly className?: string;
}

export function RecognitionDiagram({ diagram, mode, label, letters, bars = [], headlights = [], className }: DiagramProps) {
  const lit = (c: Colour) => c === "U";
  const cells = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) {
    const colour = diagram.top[r]?.[c] ?? "U";
    const edge = (r + c) % 2 === 1; const centre = r === 1 && c === 1;
    const x = X0 + c * CELL; const y = X0 + r * CELL;
    if (mode === "OLL_EDGE_RECOGNITION" && !edge && !centre) {
      cells.push(<rect key={`t${r}${c}`} x={x + 1.5} y={y + 1.5} width={CELL - 3} height={CELL - 3} rx={2} fill="none" stroke="var(--rule)" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />);
      continue;
    }
    const fill = mode === "PLL_RECOGNITION" ? "var(--face-u)" : lit(colour) ? face("U") : OFF;
    cells.push(<rect key={`t${r}${c}`} x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx={2} fill={fill} opacity={mode === "PLL_RECOGNITION" ? 0.55 : 1} stroke="var(--cube-body)" strokeWidth={1} />);
  }
  const strip = (side: Side, colours: readonly Colour[]) => colours.map((colour, i) => {
    const pos = side === "back" ? { x: X0 + i * CELL, y: PAD } : side === "front" ? { x: X0 + i * CELL, y: X0 + 3 * CELL + GAP } : side === "left" ? { x: PAD, y: X0 + i * CELL } : { x: X0 + 3 * CELL + GAP, y: X0 + i * CELL };
    const w = side === "back" || side === "front" ? CELL - 2 : STRIP; const h = side === "back" || side === "front" ? STRIP : CELL - 2;
    if (mode === "OLL_EDGE_RECOGNITION") return null;
    if (mode === "OLL_FULL_RECOGNITION" && !lit(colour)) return <rect key={`${side}${i}`} x={pos.x + 1} y={pos.y + 1} width={w} height={h} rx={1.5} fill={OFF} opacity={0.55} />;
    const letter = mode === "PLL_RECOGNITION" ? letters?.[colour] : undefined;
    return (
      <g key={`${side}${i}`}>
        <rect x={pos.x + 1} y={pos.y + 1} width={w} height={h} rx={1.5} fill={face(colour)} stroke="var(--cube-body)" strokeWidth={0.8} />
        {letter === undefined ? null : <text x={pos.x + 1 + w / 2} y={pos.y + 1 + h / 2 + 2.4} textAnchor="middle" fontSize={7} fontWeight={700} fill="var(--cube-body)">{letter}</text>}
      </g>
    );
  });
  const outline = (side: Side, dashed: boolean) => {
    const long = 3 * CELL - 2;
    const r = side === "back" ? { x: X0, y: PAD - 1.5, w: long + 2, h: STRIP + 4 } : side === "front" ? { x: X0, y: X0 + 3 * CELL + GAP - 1.5, w: long + 2, h: STRIP + 4 } : side === "left" ? { x: PAD - 1.5, y: X0, w: STRIP + 4, h: long + 2 } : { x: X0 + 3 * CELL + GAP - 1.5, y: X0, w: STRIP + 4, h: long + 2 };
    return <rect key={`o-${side}-${dashed ? "h" : "b"}`} x={r.x} y={r.y} width={r.w} height={r.h} rx={3} fill="none" stroke="var(--text)" strokeWidth={1.4} strokeDasharray={dashed ? "3 2" : undefined} />;
  };
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${SIZE} ${SIZE}`} className={className} data-diagram={mode}>
      {cells}
      {strip("back", diagram.back)}{strip("right", diagram.right)}{strip("front", diagram.front)}{strip("left", diagram.left)}
      {mode === "PLL_RECOGNITION" ? <>{bars.map((s) => outline(s, false))}{headlights.map((s) => outline(s, true))}</> : null}
    </svg>
  );
}

/* ------------------------------------------------------------------ isometric F2L view */

const S = 20;
const AX = 0.866;
/** A screen point from a cube coordinate on one of the three visible faces (front-right corner at the origin). */
const on = {
  U: (a: number, b: number): [number, number] => [-AX * S * (3 - a) + AX * S * b, -0.5 * S * (3 - a) - 0.5 * S * b],
  F: (a: number, d: number): [number, number] => [-AX * S * (3 - a), -0.5 * S * (3 - a) + S * d],
  R: (b: number, d: number): [number, number] => [AX * S * b, -0.5 * S * b + S * d],
};

export interface IsoProps { readonly iso: IsoData; readonly label: string; readonly className?: string }

/**
 * The cube from above and in front, three faces (top, front, right): the view an F2L pair is judged in. `h`
 * stickers (the pair) are lit and outlined, `d` stickers are dimmed, `n` are normal. Centres and the cross stay visible.
 */
export function IsoCube({ iso, label, className }: IsoProps) {
  const polys: ReactElement[] = [];
  const faces = ["U", "F", "R"] as const;
  faces.forEach((f, fi) => {
    for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) {
      const index = fi * 9 + row * 3 + col;
      const colour = iso.colours[index] as Colour;
      const flag = iso.flags[index] ?? "n";
      const pts: [number, number][] = f === "U"
        ? [on.U(col, 2 - row + 1), on.U(col + 1, 2 - row + 1), on.U(col + 1, 2 - row), on.U(col, 2 - row)]
        : f === "F" ? [on.F(col, row), on.F(col + 1, row), on.F(col + 1, row + 1), on.F(col, row + 1)]
        : [on.R(col, row), on.R(col + 1, row), on.R(col + 1, row + 1), on.R(col, row + 1)];
      polys.push(
        <polygon key={`${f}${row}${col}`} points={pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} fill={face(colour)} opacity={flag === "d" ? 0.3 : 1} stroke={flag === "h" ? "var(--text)" : "var(--cube-body)"} strokeWidth={flag === "h" ? 2 : 1} strokeLinejoin="round" />,
      );
    }
  });
  // Lit stickers last so their outlines are not painted over by neighbours.
  const lit = polys.filter((p) => (p.props as { strokeWidth: number }).strokeWidth === 2);
  const rest = polys.filter((p) => (p.props as { strokeWidth: number }).strokeWidth !== 2);
  return (
    <svg role="img" aria-label={label} viewBox="-56 -66 112 132" className={className} data-diagram="F2L">
      {rest}{lit}
    </svg>
  );
}
