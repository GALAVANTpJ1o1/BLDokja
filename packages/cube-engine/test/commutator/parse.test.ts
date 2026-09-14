import { Alg, Commutator, Conjugate, Move } from "cubing/alg";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { geometryMovePermutation } from "../../src/core/geometry-moves.js";
import { StickerGeometry } from "../../src/core/geometry.js";
import { mod } from "../../src/core/arrays.js";
import { PUZZLE_SIZES, VERIFIED_MOVE_FAMILIES, type PuzzleId } from "../../src/core/puzzle.js";
import { formatAlg, formatNodes, parseAlg, type AlgNode, type QuarterTurns } from "../../src/commutator/parse.js";
import { algNodesArbitrary, sugared } from "./arbitraries.js";

const PUZZLES: PuzzleId[] = ["3x3x3", "4x4x4"];

/** Input → canonical form, from the notation rules in DECISIONS D-016. */
const PARSES: readonly (readonly [string, string, PuzzleId?])[] = [
  ["R U R' U'", "R U R' U'"],
  ["", ""],
  ["   ", ""],
  ["[R, U]", "[R, U]"],
  ["[R,U]", "[R, U]"],
  ["  [ R ,U ]  ", "[R, U]"],
  ["[R U R', D]", "[R U R', D]"],
  ["[U: [R, D]]", "[U: [R, D]]"],
  // The first separator splits; the rest is the same bracket level.
  ["[U: R, D]", "[U: [R, D]]"],
  ["[R, U: D]", "[R, [U: D]]"],
  ["[R: U: D]", "[R: [U: D]]"],
  ["[R: U, D: F]", "[R: [U, [D: F]]]"],
  ["[R: U D, F]", "[R: [U D, F]]"],
  // The whole alg is an implicit bracket level.
  ["U: [R, D]", "[U: [R, D]]"],
  ["U: [R, D] U2", "[U: [R, D] U2]"],
  ["R U: F", "[R U: F]"],
  ["R, U", "[R, U]"],
  ["[R, U] [D: F] L", "[R, U] [D: F] L"],
  ["[[R: U], D]", "[[R: U], D]"],
  ["[R, U]: D", "[[R, U]: D]"],
  // Suffixes, including curly apostrophes and 2'.
  ["R2' U’ F‘ B2’", "R2 U' F' B2"],
  ["Rw r 2R M E S x y2 z'", "Rw r 2R M E S x y2 z'"],
  ["3Rw 2-3Rw' 2U2 3Fw2", "3Rw 2-3Rw' 2U2 3Fw2", "4x4x4"],
];

type ErrorCase = readonly [string, { readonly code: string; readonly index: number }, PuzzleId?];

const ERRORS: readonly ErrorCase[] = [
  ["[R, U, D]", { code: "too-many-commas", index: 5 }],
  ["[R: U, D, F]", { code: "too-many-commas", index: 8 }],
  ["R, U, D", { code: "too-many-commas", index: 4 }],
  ["[,R]", { code: "empty-operand", index: 1 }],
  ["[R,]", { code: "empty-operand", index: 2 }],
  ["[R:]", { code: "empty-operand", index: 2 }],
  ["[R, : U]", { code: "empty-operand", index: 4 }],
  ["R:", { code: "empty-operand", index: 1 }],
  [":", { code: "empty-operand", index: 0 }],
  ["[]", { code: "bracket-without-separator", index: 0 }],
  ["[R U]", { code: "bracket-without-separator", index: 0 }],
  ["[R, [U]]", { code: "bracket-without-separator", index: 4 }],
  ["[R, U", { code: "unclosed-bracket", index: 0 }],
  ["[R, [U: D]", { code: "unclosed-bracket", index: 0 }],
  ["R, U]", { code: "unmatched-closing-bracket", index: 4 }],
  ["(R U)", { code: "parentheses-unsupported", index: 0 }],
  ["[R, U] (D)2", { code: "parentheses-unsupported", index: 7 }],
  ["Q", { code: "unknown-move", index: 0 }],
  ["R U Q'", { code: "unknown-move", index: 4 }],
  ["RU", { code: "unknown-move", index: 0 }],
  ["R'2", { code: "unknown-move", index: 0 }],
  ["2-3Rw", { code: "unknown-move", index: 0 }],
  ["M", { code: "unknown-move", index: 0 }, "4x4x4"],
  ["R3", { code: "unsupported-amount", index: 0 }],
  ["U R22", { code: "unsupported-amount", index: 2 }],
  ["R . U", { code: "unexpected-character", index: 2 }],
  ["[R; U]", { code: "unexpected-character", index: 2 }],
];

/** cubing.js's parse tree for a fully bracketed alg, in this module's shape. */
function fromCubing(alg: Alg): AlgNode[] {
  return [...alg.childAlgNodes()].map((node): AlgNode => {
    const move = node.as(Move);
    if (move !== null) return { type: "move", family: move.quantum.toString(), amount: mod(move.amount, 4) as QuarterTurns };
    const commutator = node.as(Commutator);
    if (commutator !== null) return { type: "commutator", a: fromCubing(commutator.A), b: fromCubing(commutator.B) };
    const conjugate = node.as(Conjugate);
    if (conjugate !== null) return { type: "conjugate", setup: fromCubing(conjugate.A), body: fromCubing(conjugate.B) };
    throw new Error(`unexpected cubing.js node ${node.toString()}`);
  });
}

describe("parseAlg: golden cases", () => {
  it.each(PARSES.map(([input, canonical, puzzle]) => ({ input, canonical, puzzle: puzzle ?? "3x3x3" })))(
    "$input → $canonical",
    ({ input, canonical, puzzle }) => {
      const parsed = parseAlg(puzzle, input);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
      expect(formatAlg(parsed.value)).toBe(canonical);
    },
  );

  it.each(ERRORS.map(([input, expected, puzzle]) => ({ input, expected, puzzle: puzzle ?? "3x3x3" })))("$input is rejected", ({ input, expected, puzzle }) => {
    const parsed = parseAlg(puzzle, input);
    expect(parsed.ok ? "parsed" : { code: parsed.error.code, index: parsed.error.index }).toEqual(expected);
  });

  it("reports the text of a bad move", () => {
    expect(parseAlg("3x3x3", "R Rx2")).toEqual({ ok: false, error: { code: "unknown-move", index: 2, text: "Rx2" } });
    expect(parseAlg("3x3x3", "F R3'")).toEqual({ ok: false, error: { code: "unsupported-amount", index: 2, text: "R3'" } });
    expect(parseAlg("3x3x3", "R é")).toEqual({ ok: false, error: { code: "unexpected-character", index: 2, character: "é" } });
  });
});

describe.each(PUZZLES)("parseAlg properties: %s", (puzzle) => {
  it("accepts every verified family with every suffix, and reads 2' as a half turn", () => {
    const geometry = new StickerGeometry(PUZZLE_SIZES[puzzle]);
    for (const family of VERIFIED_MOVE_FAMILIES[puzzle]) {
      const read = (text: string) => {
        const parsed = parseAlg(puzzle, text);
        if (!parsed.ok) throw new Error(`${text}: ${JSON.stringify(parsed.error)}`);
        return parsed.value.nodes;
      };
      expect(read(family)).toEqual([{ type: "move", family, amount: 1 }]);
      expect(read(`${family}2`)).toEqual([{ type: "move", family, amount: 2 }]);
      expect(read(`${family}'`)).toEqual([{ type: "move", family, amount: 3 }]);
      expect(read(`${family}’`)).toEqual(read(`${family}'`));
      expect(read(`${family}‘`)).toEqual(read(`${family}'`));
      expect(read(`${family}2'`)).toEqual(read(`${family}2`));
      // The geometry model agrees that 2' and 2 are the same turn.
      expect(Array.from(geometryMovePermutation(geometry, `${family}2'`))).toEqual(Array.from(geometryMovePermutation(geometry, `${family}2`)));
    }
  });

  it("round-trips the canonical form", () => {
    fc.assert(
      fc.property(algNodesArbitrary(puzzle), (nodes) => {
        const parsed = parseAlg(puzzle, formatNodes(nodes));
        if (!parsed.ok) throw new Error(`${formatNodes(nodes)}: ${JSON.stringify(parsed.error)}`);
        expect(parsed.value.nodes).toEqual(nodes);
      }),
      { seed: 16092026, numRuns: 500 },
    );
  });

  it("reads the form with optional brackets left out as the same tree", () => {
    fc.assert(
      fc.property(algNodesArbitrary(puzzle), (nodes) => {
        const text = sugared(nodes);
        const parsed = parseAlg(puzzle, text);
        if (!parsed.ok) throw new Error(`${text}: ${JSON.stringify(parsed.error)}`);
        expect(parsed.value.nodes, text).toEqual(nodes);
      }),
      { seed: 17092026, numRuns: 500 },
    );
  });

  it("builds the same tree as cubing.js's parser for fully bracketed algs", () => {
    fc.assert(
      fc.property(algNodesArbitrary(puzzle), (nodes) => {
        const text = formatNodes(nodes);
        const parsed = parseAlg(puzzle, text);
        if (!parsed.ok) throw new Error(`${text}: ${JSON.stringify(parsed.error)}`);
        expect(parsed.value.nodes, text).toEqual(fromCubing(new Alg(text)));
      }),
      { seed: 18092026, numRuns: 500 },
    );
  });
});
