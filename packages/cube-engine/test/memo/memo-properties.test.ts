import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { memoView, type MemoLetterSource, type SingleLetterRepresentation } from "../../src/memo/memo.js";
import { pieceType, type PieceTypeId } from "../../src/pieces/piece-types.js";
import { createRng } from "../../src/random/prng.js";
import { randomMoveSequence, randomState3x3 } from "../../src/random/random-state.js";
import { trace, type TraceInput, type TraceResult } from "../../src/trace/trace.js";

/**
 * D-015's required properties, over random states, every buffer, both orientation policies and
 * both memo modes. Expected values are computed from the TraceResult and the scheme data, never
 * from the memo layer.
 */

const MODES: SingleLetterRepresentation[] = ["selfPair", "chain"];
const POLICIES = ["separate", "asTargets"] as const;

function checkMemo(r: TraceResult, mode: SingleLetterRepresentation, letters: Readonly<Record<string, string>>, context: string): void {
  const view = memoView(r, { singleLetterRepresentation: mode });
  const misoriented = r.orientedInPlace.filter((o) => !o.isBuffer);
  const m = misoriented.length;

  // Parity is exactly the trace's.
  expect(view.parity, context).toBe(r.parity);

  // Items come as pairs, then at most one lone letter, then orientation markers.
  expect(view.items.map((i) => i.kind[0]).join(""), context).toMatch(/^p*l?o*$/);

  const letterOfSource = (source: MemoLetterSource, other: string): string => {
    switch (source.from) {
      case "target":
        return r.targets[source.index] ?? "(no such target)";
      case "home":
        // Independent of isOrientationReference: a piece's name is its reference sticker's name (D-009).
        return letters[source.piece] ?? "(no letter)";
      case "displayed":
        return misoriented.find((o) => o.piece === source.piece)?.letter ?? "(not misoriented)";
      case "repeat":
        return other;
    }
  };

  const targetIndices: number[] = [];
  for (const item of view.items) {
    const [a, b] = item.letters;
    expect(a.length > 0 && b.length > 0, context).toBe(true);
    expect(letterOfSource(item.sources[0], b), `${context}: first letter of ${a}${b}`).toBe(a);
    expect(letterOfSource(item.sources[1], a), `${context}: second letter of ${a}${b}`).toBe(b);
    for (const source of item.sources) {
      if (source.from === "target") targetIndices.push(source.index);
      // The buffer's own twist or flip is never memorised.
      if (source.from === "home" || source.from === "displayed") expect(source.piece, context).not.toBe(r.buffer.piece);
    }
    // A pair made of two traced targets is never a diagonal cell; nor is any other pair.
    if (item.sources.every((s) => s.from === "target")) expect(a, `${context}: target pair ${a}${b}`).not.toBe(b);
    if (item.kind === "pair") expect(a, `${context}: pair ${a}${b}`).not.toBe(b);
  }

  // Every traced target appears exactly once, in order: never doubled, never dropped.
  expect(targetIndices, context).toEqual(r.targets.map((_, i) => i));

  // The number of diagonal items follows the mode's rule.
  const diagonal = view.items.filter((i) => i.letters[0] === i.letters[1]).length;
  const expectedDiagonal = mode === "selfPair" ? (r.targetCount % 2) + m : ((r.targetCount + m) % 2) + m;
  expect(diagonal, `${context}: diagonal items`).toBe(expectedDiagonal);
  expect(view.items.filter((i) => i.kind !== "pair").length, context).toBe(expectedDiagonal);
}

describe("memo view properties", () => {
  it("hold on random 3x3 states for every buffer, both policies and both modes", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const types = (["corners", "edges"] as const).map((id) => ({ id, stickers: pieceType(puzzle, id).stickers.map((s) => s.name) }));
    let views = 0;
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (seed) => {
        const input: TraceInput = { pattern: randomState3x3(puzzle, createRng(seed)) };
        for (const { id, stickers } of types) {
          const letters = scheme.letters[id] ?? {};
          for (const buffer of stickers) {
            for (const orientedInPlace of POLICIES) {
              const result = trace(puzzle, input, { pieceType: id, buffer, scheme, policy: { orientedInPlace } });
              if (!result.ok) throw new Error(JSON.stringify(result.error));
              for (const mode of MODES) {
                checkMemo(result.value, mode, letters, `seed ${JSON.stringify(seed)} ${id} ${buffer} ${orientedInPlace} ${mode}`);
                views++;
              }
            }
          }
        }
      }),
      { seed: 15092026, numRuns: 250 },
    );
    expect(views).toBe(250 * (24 + 24) * 2 * 2);
  });

  it("hold on 4x4 corners and wings in the fixed frame", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const scheme = speffzScheme(puzzle);
    const rng = createRng("memo-properties-4x4");
    const moves = ["U", "R", "F", "Uw", "Rw", "Fw", "2U", "2R", "2F", "2D", "2L", "2B"].flatMap((m) => [m, `${m}2`, `${m}'`]);
    for (let i = 0; i < 40; i++) {
      const input: TraceInput = { alg: randomMoveSequence(rng, moves, 50).join(" ") };
      for (const id of ["corners", "wings"] as const satisfies readonly PieceTypeId[]) {
        const letters = scheme.letters[id] ?? {};
        for (const sticker of pieceType(puzzle, id).stickers) {
          for (const orientedInPlace of POLICIES) {
            const result = trace(puzzle, input, { pieceType: id, buffer: sticker.name, scheme, frame: { kind: "asIs" }, policy: { orientedInPlace } });
            if (!result.ok) throw new Error(JSON.stringify(result.error));
            for (const mode of MODES) checkMemo(result.value, mode, letters, `4x4 ${i} ${id} ${sticker.name} ${orientedInPlace} ${mode}`);
          }
        }
      }
    }
  });

  it("sees both chain-mode hazards from D-015 in random states (so the parity flag is doing real work)", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const rng = createRng("memo-properties-hazards");
    let leftoverWithoutParity = 0;
    let parityWithoutLeftover = 0;
    for (let i = 0; i < 500; i++) {
      const result = trace(puzzle, { pattern: randomState3x3(puzzle, rng) }, { pieceType: "corners", buffer: "UFR", scheme });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      const view = memoView(result.value, { singleLetterRepresentation: "chain" });
      const hasLeftover = view.items.some((item) => item.kind === "loneLetter");
      if (hasLeftover && !view.parity) leftoverWithoutParity++;
      if (!hasLeftover && view.parity) parityWithoutLeftover++;
    }
    expect(leftoverWithoutParity).toBeGreaterThan(0);
    expect(parityWithoutLeftover).toBeGreaterThan(0);
  });
});
