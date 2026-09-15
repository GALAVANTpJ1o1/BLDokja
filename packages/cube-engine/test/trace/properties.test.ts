import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadPuzzle, verifiedMoves } from "../../src/core/puzzle.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { trace } from "../../src/trace/trace.js";
import { TraceOracle } from "../oracle/trace-oracle.js";

describe("trace properties (3x3x3, random scrambles, all buffers)", () => {
  it("parity equals target-count parity; pairs, breaks and kinds are consistent; replaying the targets solves the piece type", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const moves = verifiedMoves("3x3x3");
    const oracles = { corners: new TraceOracle(3, "corners"), edges: new TraceOracle(3, "edges") };

    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...moves), { minLength: 0, maxLength: 40 }),
        fc.constantFrom("corners" as const, "edges" as const),
        fc.nat(),
        fc.constantFrom("separate" as const, "asTargets" as const),
        (sequence, typeId, bufferSeed, orientedInPlace) => {
          const type = pieceType(puzzle, typeId);
          const buffer = type.stickers[bufferSeed % type.stickers.length]?.name ?? "";
          const alg = sequence.join(" ");
          const result = trace(puzzle, { alg }, { pieceType: typeId, buffer, scheme, policy: { orientedInPlace } });
          if (!result.ok) throw new Error(JSON.stringify(result.error));
          const r = result.value;

          expect(r.targetCount).toBe(r.targets.length);
          expect(r.parity).toBe(r.targetCount % 2 === 1);
          expect(r.pairs.flat()).toEqual(r.targets);
          expect(r.pairs.slice(0, -1).every((p) => p.length === 2)).toBe(true);
          expect(r.cycleBreaks.every((i) => r.targetKinds[i] === "cycleBreak" || r.targetKinds[i] === "orientationTarget")).toBe(true);
          expect(r.cycles.map((c) => c.start).filter((s) => s > 0 || r.targetKinds[0] !== "normal")).toEqual(r.cycleBreaks);
          if (orientedInPlace === "asTargets") expect(r.orientedInPlace).toEqual([]);

          // Pieces never touched by the trace are exactly the solved ones (plus a solved buffer).
          const touched = new Set(r.targetStickers.map((s) => type.stickerByName(s)?.position));
          for (const piece of type.pieces) {
            if (r.solvedPieces.includes(piece.name)) expect(touched.has(piece.position)).toBe(false);
          }

          // Replay the targets as swaps in the independent colour model, then undo the reported
          // twists/flips: the piece type must be solved.
          const oracle = oracles[typeId];
          const colours = oracle.normaliseCentres(oracle.coloursAfter(alg));
          const bufferSlot = oracle.slotNamed(buffer);
          for (const target of r.targetStickers) oracle.swap(colours, bufferSlot, oracle.slotNamed(target));
          for (const o of r.orientedInPlace) {
            const cubie = oracle.cubieOfSlot(oracle.slotNamed(o.piece));
            const turns = o.direction === "clockwise" ? -1 : 1;
            oracle.twist(colours, cubie, turns);
          }
          for (let i = 0; i < oracle.cubies.length; i++) expect(oracle.isSolved(colours, i)).toBe(true);
        },
      ),
      { seed: 5132026, numRuns: 1500 },
    );
  });

  it("gives the same result for an alg and for the pattern it produces", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const alg = "R U2 D' B D' F2 L' U R2 F' D2 B L2 x y'";
    for (const pieceTypeId of ["corners", "edges"] as const) {
      const config = { pieceType: pieceTypeId, buffer: pieceTypeId === "corners" ? "UFR" : "UF", scheme };
      const fromAlg = trace(puzzle, { alg }, config);
      const fromPattern = trace(puzzle, { pattern: puzzle.kpuzzle.defaultPattern().applyAlg(alg) }, config);
      expect(fromPattern).toEqual(fromAlg);
    }
  });
});

describe("trace errors", () => {
  it("reports each kind of bad input without throwing", async () => {
    const three = await loadPuzzle("3x3x3");
    const four = await loadPuzzle("4x4x4");
    const s3 = speffzScheme(three);
    const s4 = speffzScheme(four);
    const code = (r: ReturnType<typeof trace>) => (r.ok ? "ok" : r.error.code);

    expect(code(trace(three, { alg: "R U Q'" }, { pieceType: "corners", buffer: "UFR", scheme: s3 }))).toBe("invalid-alg");
    expect(code(trace(three, { alg: "R" }, { pieceType: "corners", buffer: "UF", scheme: s3 }))).toBe("unknown-buffer");
    expect(code(trace(three, { alg: "R" }, { pieceType: "wings", buffer: "UFr", scheme: s3 }))).toBe("piece-type-not-on-puzzle");
    expect(code(trace(four, { alg: "R" }, { pieceType: "wings", buffer: "UFr", scheme: s4 }))).toBe("frame-required");
    expect(code(trace(four, { alg: "R" }, { pieceType: "wings", buffer: "UFr", scheme: s4, frame: { kind: "centers" } }))).toBe(
      "frame-not-supported",
    );
    expect(code(trace(four, { alg: "R" }, { pieceType: "xcenters", buffer: "Ufr", scheme: s4, frame: { kind: "rotation", alg: "R" } }))).toBe("unknown-rotation");
    expect(code(trace(four, { alg: "R" }, { pieceType: "xcenters", buffer: "Ufr", scheme: s4, frame: { kind: "corner", piece: "UFr" } }))).toBe("unknown-reference-corner");
    expect(code(trace(three, { alg: "R" }, { pieceType: "corners", buffer: "UFR", scheme: s3, frame: { kind: "corner", piece: "DBL" } }))).toBe("frame-not-supported");
    const broken = { ...s3, letters: { ...s3.letters, corners: { ...s3.letters.corners, UFR: "A" } } };
    expect(code(trace(three, { alg: "R" }, { pieceType: "corners", buffer: "UFR", scheme: broken }))).toBe("invalid-scheme");
  });
});
