/**
 * Text cube nets for hand verification: the colour of every sticker, drawn from the geometry
 * model alone (no kpuzzle, no tracer). Colours are written as the face each sticker belongs to.
 */
import { FACES, type Face } from "../src/core/geometry.js";
import { TraceOracle } from "../test/oracle/trace-oracle.js";

export function renderNet(oracle: TraceOracle, colours: readonly Face[]): string {
  const g = oracle.geometry;
  const n = g.size;
  const cell = (face: Face, row: number, col: number) => colours[g.stickerAt(face, row, col)] ?? "?";
  const faceRow = (face: Face, row: number) => Array.from({ length: n }, (_, col) => cell(face, row, col)).join(" ");
  const pad = " ".repeat(n * 2 + 1);
  const lines: string[] = [];
  for (let row = 0; row < n; row++) lines.push(`${pad}${faceRow("U", row)}`);
  for (let row = 0; row < n; row++) lines.push((["L", "F", "R", "B"] as Face[]).map((f) => faceRow(f, row)).join("  "));
  for (let row = 0; row < n; row++) lines.push(`${pad}${faceRow("D", row)}`);
  return lines.join("\n");
}

/** Which net cell each named sticker is, for reading nets by hand. */
export function renderLegend(oracle: TraceOracle): string {
  const g = oracle.geometry;
  return FACES.map((face) =>
    Array.from({ length: g.size }, (_, row) =>
      Array.from({ length: g.size }, (_, col) => oracle.nameOf(g.stickerAt(face, row, col)).padEnd(4)).join(" "),
    ).join("\n"),
  ).join("\n\n");
}
