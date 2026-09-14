import { describe, expect, it } from "vitest";
import { loadPuzzle, verifiedMoves, type Puzzle, type PuzzleId } from "../../src/core/puzzle.js";
import type { Scheme } from "../../src/lettering/scheme.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { pieceType, type PieceTypeId } from "../../src/pieces/piece-types.js";
import { createRng, shuffled, type Rng } from "../../src/random/prng.js";
import { randomMoveSequence } from "../../src/random/random-state.js";
import { trace } from "../../src/trace/trace.js";
import { TraceOracle } from "../oracle/trace-oracle.js";

/**
 * The kpuzzle-based tracer and the independent colour-reading oracle must agree exactly,
 * for every buffer, both orientation policies, Speffz and a shuffled scheme.
 */

function shuffledScheme(puzzle: Puzzle, rng: Rng): Scheme {
  const base = speffzScheme(puzzle);
  const letters: Scheme["letters"] = {};
  for (const [id, entries] of Object.entries(base.letters)) {
    const keys = Object.keys(entries);
    const values = shuffled(rng, Object.values(entries));
    letters[id as PieceTypeId] = Object.fromEntries(keys.map((k, i) => [k, values[i] ?? "?"]));
  }
  return { ...base, id: "shuffled", name: "Shuffled", letters };
}

const CASES: { puzzle: PuzzleId; type: "corners" | "edges" | "wings"; states: number; moves: (id: PuzzleId) => string[] }[] = [
  { puzzle: "3x3x3", type: "corners", states: 250, moves: verifiedMoves },
  { puzzle: "3x3x3", type: "edges", states: 250, moves: verifiedMoves },
  // 4x4: moves that never disturb the DLB corner, and no rotations, so the frame is fixed.
  {
    puzzle: "4x4x4",
    type: "corners",
    states: 80,
    moves: () => ["U", "R", "F", "Uw", "Rw", "Fw", "2U", "2R", "2F", "2D", "2L", "2B"].flatMap((m) => [m, `${m}2`, `${m}'`]),
  },
  {
    puzzle: "4x4x4",
    type: "wings",
    states: 80,
    moves: () => ["U", "R", "F", "Uw", "Rw", "Fw", "2U", "2R", "2F", "2D", "2L", "2B"].flatMap((m) => [m, `${m}2`, `${m}'`]),
  },
];

describe.each(CASES)("tracer ≡ oracle: $puzzle $type", ({ puzzle: id, type: typeId, states, moves }) => {
  it("agrees on targets, target kinds, orientation reports and parity", async () => {
    const puzzle = await loadPuzzle(id);
    const type = pieceType(puzzle, typeId);
    const oracle = new TraceOracle(puzzle.size, typeId);
    const rng = createRng(`differential-${id}-${typeId}`);
    const schemes = [speffzScheme(puzzle), shuffledScheme(puzzle, rng)];
    const buffers = typeId === "wings" ? type.pieces.map((p) => p.stickers[0]?.name ?? "") : type.stickers.map((s) => s.name);
    let compared = 0;

    for (let i = 0; i < states; i++) {
      const alg = randomMoveSequence(rng, moves(id), 30 + rng.int(20)).join(" ");
      const raw = oracle.coloursAfter(alg);
      const colours = id === "3x3x3" ? oracle.normaliseCentres(raw) : raw;
      for (const scheme of schemes) {
        const letters = scheme.letters[typeId] ?? {};
        for (const buffer of buffers) {
          for (const orientedInPlace of ["separate", "asTargets"] as const) {
            const result = trace(puzzle, { alg }, {
              pieceType: typeId,
              buffer,
              scheme,
              frame: id === "3x3x3" ? { kind: "centers" } : { kind: "asIs" },
              policy: { orientedInPlace },
            });
            if (!result.ok) throw new Error(JSON.stringify(result.error));
            const expected = oracle.trace(colours, { kind: typeId, buffer, letters, orientedInPlace });
            const context = `${alg} | buffer ${buffer} | ${orientedInPlace} | ${scheme.id}`;
            expect(result.value.targetStickers, context).toEqual(expected.targetStickers);
            expect(result.value.targetKinds, context).toEqual(expected.kinds);
            const byPiece = (a: { piece: string }, b: { piece: string }) => a.piece.localeCompare(b.piece);
            // The oracle names a piece by the home slot of its reference colour, so that name is also the home sticker.
            expect(
              result.value.orientedInPlace
                .map((o) => ({ piece: o.piece, sticker: o.sticker, letter: o.letter, homeSticker: o.homeSticker, homeLetter: o.homeLetter, isBuffer: o.isBuffer }))
                .sort(byPiece),
              context,
            ).toEqual(
              expected.orientedInPlace
                .map((o) => ({ ...o, letter: letters[o.sticker], homeSticker: o.piece, homeLetter: letters[o.piece] }))
                .sort(byPiece),
            );
            expect(result.value.parity, context).toBe(expected.parity);
            compared++;
          }
        }
      }
    }
    expect(compared).toBe(states * schemes.length * buffers.length * 2);
  });
});
