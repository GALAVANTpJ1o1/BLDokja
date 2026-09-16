import { applyFrame, expandNodes, formatMoves, parseAlg, trace, type BufferPair } from "@bld/cube-engine";
import { graphemes } from "@bld/storage";
import type { Reader } from "@/lib/reader";
import { misplacedPieces, sameLook } from "./effects";

export interface DebugInput {
  scramble: string; memoEdges: string; memoCorners: string; recallEdges: string; recallCorners: string;
  executed: string; intended: string; orientation: boolean; parityOmitted: boolean;
}
export type FailureCategory = "tracing" | "orientation" | "parity" | "recall" | "execution";
export const memoLetters = (text: string) => graphemes(text.normalize("NFC").toLocaleUpperCase("en-GB").replace(/\s+/g, ""));
export function debugSolve(reader: Reader, buffers: BufferPair, input: DebugInput) {
  const canonical = (text: string) => {
    if (text.length > 10_000) return undefined;
    const parsed = parseAlg(reader.puzzle.id, text);
    return parsed.ok ? formatMoves(expandNodes(parsed.value.nodes)) : undefined;
  };
  const scramble = canonical(input.scramble);
  const executed = canonical(input.executed);
  const intended = canonical(input.intended);
  if (scramble === undefined || executed === undefined || intended === undefined) return undefined;
  const edges = trace(reader.puzzle, { alg: scramble }, { pieceType: "edges", buffer: buffers.edges, scheme: reader.scheme });
  const corners = trace(reader.puzzle, { alg: scramble }, { pieceType: "corners", buffer: buffers.corners, scheme: reader.scheme });
  if (!edges.ok || !corners.ok) return undefined;
  const differences: { pieceType: "edges" | "corners"; index: number; expected: string; actual: string }[] = [];
  for (const pieceType of ["edges", "corners"] as const) {
    const text = pieceType === "edges" ? input.memoEdges : input.memoCorners;
    if (text.trim() === "") continue;
    const actual = memoLetters(text);
    const expected = pieceType === "edges" ? edges.value.targets : corners.value.targets;
    const index = Array.from({ length: Math.max(actual.length, expected.length) }, (_, i) => i).find((i) => actual[i] !== expected[i]);
    if (index !== undefined) differences.push({ pieceType, index, expected: expected[index] ?? "", actual: actual[index] ?? "" });
  }
  const combined = `${scramble} ${executed}`;
  const framed = applyFrame(reader.puzzle, reader.puzzle.kpuzzle.defaultPattern().applyAlg(combined), { kind: "centers" });
  if (!framed.ok) return undefined;
  const normalised = `${combined} ${framed.value.alg}`;
  const hasExecution = input.executed.trim() !== "";
  const solved = hasExecution && sameLook(reader.puzzle, normalised, "");
  const residual = misplacedPieces(reader.puzzle, normalised);
  const categories: FailureCategory[] = [];
  if (differences.length > 0) categories.push("tracing");
  if (input.orientation || hasExecution && framed.value.alg !== "") categories.push("orientation");
  if (input.parityOmitted && (edges.value.parity || corners.value.parity)) categories.push("parity");
  if (input.recallEdges.trim() !== "" && memoLetters(input.recallEdges).join("|") !== memoLetters(input.memoEdges).join("|") || input.recallCorners.trim() !== "" && memoLetters(input.recallCorners).join("|") !== memoLetters(input.memoCorners).join("|")) categories.push("recall");
  if (input.intended.trim() !== "" && hasExecution && !sameLook(reader.puzzle, intended, executed)) categories.push("execution");
  return { traces: { edges: edges.value, corners: corners.value }, differences, categories, solved, hasExecution, residual, replay: { setup: scramble, alg: executed } };
}
