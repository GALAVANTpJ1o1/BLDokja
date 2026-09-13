import { describe, expect, it } from "vitest";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import type { Scheme } from "../../src/lettering/scheme.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { pieceType, type PieceTypeId } from "../../src/pieces/piece-types.js";
import { createRng, shuffled, type Rng } from "../../src/random/prng.js";
import { randomMoveSequence, randomState3x3 } from "../../src/random/random-state.js";
import { trace, type TraceInput, type TraceResult } from "../../src/trace/trace.js";

/**
 * The invariants behind the 552-vs-576 decision (docs/reports/letter-pair-reachability.md):
 *  1. two consecutive targets are never the same sticker, so no pair repeats a letter;
 *  2. no target is ever a sticker of the buffer piece;
 *  3. under "separate", two consecutive targets are never on the same piece;
 *  4. under "asTargets", consecutive targets share a piece only inside an orientation cycle,
 *     which always starts from that piece's lowest letter (with the default break order).
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

function checkInvariants(puzzle: Puzzle, typeId: PieceTypeId, r: TraceResult, orientedInPlace: "separate" | "asTargets", scheme: Scheme): void {
  const type = pieceType(puzzle, typeId);
  const letters = scheme.letters[typeId] ?? {};
  const bufferPosition = type.stickerByName(r.buffer.sticker)?.position;
  const positionOf = (name: string) => type.stickerByName(name)?.position;

  for (let i = 0; i < r.targetStickers.length; i++) {
    const sticker = r.targetStickers[i] ?? "";
    if (positionOf(sticker) === bufferPosition) throw new Error(`target ${sticker} is on the buffer piece`);
    if (i === 0) continue;
    const previous = r.targetStickers[i - 1] ?? "";
    if (previous === sticker) throw new Error(`same sticker twice in a row: ${r.targetStickers.join(" ")}`);
    if (positionOf(previous) === positionOf(sticker)) {
      if (orientedInPlace === "separate") throw new Error(`same piece twice in a row under separate: ${r.targetStickers.join(" ")}`);
      const bothOrientation = r.targetKinds[i - 1] === "orientationTarget" && r.targetKinds[i] === "orientationTarget";
      if (!bothOrientation) throw new Error(`same piece twice in a row outside an orientation cycle: ${r.targetStickers.join(" ")}`);
      const pieceLetters = type.pieces[positionOf(sticker) ?? -1]?.stickers.map((s) => letters[s.name] ?? "") ?? [];
      const lowest = [...pieceLetters].sort()[0];
      if (letters[previous] !== lowest) throw new Error(`orientation cycle doesn't start at the piece's lowest letter: ${previous}`);
    }
  }
  for (const [first, second] of r.pairs) {
    if (second !== undefined && first === second) throw new Error(`pair repeats a letter: ${first}${second}`);
  }
}

describe("letter-pair invariants", () => {
  it("hold for 10,000 random 3x3 states, every buffer, both policies, two schemes", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const rng = createRng("letter-pair-invariants-3x3");
    const schemes = [speffzScheme(puzzle), shuffledScheme(puzzle, rng)];
    const types = (["corners", "edges"] as const).map((id) => ({ id, buffers: pieceType(puzzle, id).stickers.map((s) => s.name) }));
    let traces = 0;
    for (let i = 0; i < 10_000; i++) {
      const input: TraceInput = { pattern: randomState3x3(puzzle, rng) };
      // Every state is checked with both schemes and both policies; buffers rotate through all 24 stickers
      // so that each buffer sees over 800 states.
      for (const { id, buffers } of types) {
        for (const scheme of schemes) {
          for (const orientedInPlace of ["separate", "asTargets"] as const) {
            for (let b = 0; b < 2; b++) {
              const buffer = buffers[(i * 2 + b) % buffers.length] ?? "";
              const r = trace(puzzle, input, { pieceType: id, buffer, scheme, policy: { orientedInPlace } });
              if (!r.ok) throw new Error(JSON.stringify(r.error));
              checkInvariants(puzzle, id, r.value, orientedInPlace, scheme);
              traces++;
            }
          }
        }
      }
    }
    expect(traces).toBe(10_000 * 2 * 2 * 2 * 2);
  });

  it("hold for 4x4 corners and wings in the fixed frame, every buffer", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const rng = createRng("letter-pair-invariants-4x4");
    const scheme = speffzScheme(puzzle);
    const moves = ["U", "R", "F", "Uw", "Rw", "Fw", "2U", "2R", "2F", "2D", "2L", "2B"].flatMap((m) => [m, `${m}2`, `${m}'`]);
    for (let i = 0; i < 400; i++) {
      const input: TraceInput = { alg: randomMoveSequence(rng, moves, 50).join(" ") };
      for (const id of ["corners", "wings"] as const) {
        for (const sticker of pieceType(puzzle, id).stickers) {
          for (const orientedInPlace of ["separate", "asTargets"] as const) {
            const r = trace(puzzle, input, { pieceType: id, buffer: sticker.name, scheme, frame: { kind: "asIs" }, policy: { orientedInPlace } });
            if (!r.ok) throw new Error(JSON.stringify(r.error));
            checkInvariants(puzzle, id, r.value, orientedInPlace, scheme);
          }
        }
      }
    }
  });
});
