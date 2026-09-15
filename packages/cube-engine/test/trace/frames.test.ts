import { describe, expect, it } from "vitest";
import { wholeCubeRotationAlgs } from "../../src/core/frame.js";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle, verifiedMoves } from "../../src/core/puzzle.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { createRng } from "../../src/random/prng.js";
import { randomMoveSequence } from "../../src/random/random-state.js";
import { applyFrame, trace } from "../../src/trace/trace.js";
import { TraceOracle } from "../oracle/trace-oracle.js";
import { XCentreOracle } from "../oracle/xcentre-oracle.js";

/**
 * 4x4 orientation references (DECISIONS D-014, D-032): every frame is one of the 24 rotations, applied
 * after the scramble. A corner reference is checked against geometry colours, not kpuzzle orientation.
 */

/** The 24 rotations as x/y strings, found from the geometry model by the test itself. */
function rotationStrings(oracle: XCentreOracle): string[] {
  const found = new Map<string, string>();
  const queue = [""];
  while (queue.length > 0 && found.size < 24) {
    const alg = queue.shift() ?? "";
    const key = geometryAlgPermutation(oracle.geometry, alg).join(",");
    if (found.has(key)) continue;
    found.set(key, alg);
    for (const m of ["x", "y"]) queue.push(alg === "" ? m : `${alg} ${m}`);
  }
  return [...found.values()];
}

describe("4x4 frames", () => {
  it("a named rotation must be one of the 24; 3x3 only takes centres or as-is", async () => {
    const four = await loadPuzzle("4x4x4");
    const three = await loadPuzzle("3x3x3");
    const pattern = four.kpuzzle.defaultPattern().applyAlg("R U 2F");
    for (const r of wholeCubeRotationAlgs(four)) {
      const framed = applyFrame(four, pattern, { kind: "rotation", alg: r.alg });
      if (!framed.ok) throw new Error(JSON.stringify(framed.error));
      expect(framed.value.pattern.isIdentical(pattern.applyAlg(r.alg)), r.alg).toBe(true);
    }
    const x2 = applyFrame(four, pattern, { kind: "rotation", alg: "x x" });
    expect(x2.ok && x2.value.alg).toBe("x2");
    const code = (r: ReturnType<typeof applyFrame>) => (r.ok ? "ok" : r.error.code);
    expect(code(applyFrame(four, pattern, { kind: "rotation", alg: "R" }))).toBe("unknown-rotation");
    expect(code(applyFrame(four, pattern, { kind: "rotation", alg: "Q" }))).toBe("unknown-rotation");
    expect(code(applyFrame(four, pattern, { kind: "corner", piece: "UF" }))).toBe("unknown-reference-corner");
    const threePattern = three.kpuzzle.defaultPattern();
    expect(code(applyFrame(three, threePattern, { kind: "rotation", alg: "x" }))).toBe("frame-not-supported");
    expect(code(applyFrame(three, threePattern, { kind: "corner", piece: "DBL" }))).toBe("frame-not-supported");
  });

  it("a corner reference picks exactly one rotation, shows that corner solved in colours, and ignores a trailing rotation", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const oracle = new XCentreOracle();
    const corners = pieceType(puzzle, "corners");
    const rng = createRng("frames-corner");
    const moves = verifiedMoves("4x4x4");
    const rotations = wholeCubeRotationAlgs(puzzle);
    for (let i = 0; i < 20; i++) {
      const scramble = randomMoveSequence(rng, moves, 30).join(" ");
      const pattern = puzzle.kpuzzle.defaultPattern().applyAlg(scramble);
      for (const piece of corners.pieces) {
        const framed = applyFrame(puzzle, pattern, { kind: "corner", piece: piece.name });
        if (!framed.ok) throw new Error(JSON.stringify(framed.error));
        const context = `${scramble} | ${piece.name}`;
        expect(pattern.applyAlg(framed.value.alg).isIdentical(framed.value.pattern), context).toBe(true);
        // Geometry colours after the scramble and the chosen rotation: the corner's stickers match their faces.
        const colours = oracle.coloursAfter(`${scramble} ${framed.value.alg}`);
        expect(piece.stickers.every((s) => colours[s.index] === oracle.geometry.sticker(s.index).face), context).toBe(true);
        // No other rotation does that.
        const fitting = rotations.filter((r) => {
          const c = oracle.coloursAfter(`${scramble} ${r.alg}`);
          return piece.stickers.every((s) => c[s.index] === oracle.geometry.sticker(s.index).face);
        });
        expect(fitting.map((r) => r.alg), context).toEqual([framed.value.alg]);
        // Holding the cube differently before choosing the reference changes nothing.
        const extra = rotations[rng.int(24)]?.alg ?? "";
        const again = applyFrame(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(`${scramble} ${extra}`), { kind: "corner", piece: piece.name });
        expect(again.ok && again.value.pattern.isIdentical(framed.value.pattern), `${context} + ${extra}`).toBe(true);
      }
    }
  });

  it("traces under a corner reference match the colour oracles on colours rotated until that corner is solved", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const scheme = speffzScheme(puzzle);
    const xOracle = new XCentreOracle();
    const wingOracle = new TraceOracle(4, "wings");
    const cornerOracle = new TraceOracle(4, "corners");
    const rotationAlgs = rotationStrings(xOracle);
    expect(rotationAlgs).toHaveLength(24);
    const reference = pieceType(puzzle, "corners").pieceByName("DBL");
    if (reference === undefined) throw new Error("no DBL");
    const rng = createRng("frames-trace");
    const moves = verifiedMoves("4x4x4");
    for (let i = 0; i < 25; i++) {
      const scramble = randomMoveSequence(rng, moves, 30).join(" ");
      const raw = xOracle.coloursAfter(scramble);
      const rotated = rotationAlgs.map((alg) => xOracle.rotate(raw, alg)).filter((c) => reference.stickers.every((s) => c[s.index] === xOracle.geometry.sticker(s.index).face));
      expect(rotated, scramble).toHaveLength(1);
      const colours = rotated[0] ?? [];
      const frame = { kind: "corner", piece: "DBL" } as const;

      const x = trace(puzzle, { alg: scramble }, { pieceType: "xcenters", buffer: "Ubl", scheme, frame });
      if (!x.ok) throw new Error(JSON.stringify(x.error));
      expect(x.value.targetStickers, scramble).toEqual(xOracle.trace(colours, { buffer: "Ubl", letters: scheme.letters.xcenters ?? {}, sameColour: "avoidBufferColour" }).targetStickers);

      const w = trace(puzzle, { alg: scramble }, { pieceType: "wings", buffer: "DFr", scheme, frame });
      if (!w.ok) throw new Error(JSON.stringify(w.error));
      const wingExpected = wingOracle.trace(colours, { kind: "wings", buffer: "DFr", letters: scheme.letters.wings ?? {}, orientedInPlace: "separate" });
      expect(w.value.targetStickers, scramble).toEqual(wingExpected.targetStickers);
      expect(w.value.parity, scramble).toBe(wingExpected.parity);

      const c = trace(puzzle, { alg: scramble }, { pieceType: "corners", buffer: "UBL", scheme, frame });
      if (!c.ok) throw new Error(JSON.stringify(c.error));
      const cornerExpected = cornerOracle.trace(colours, { kind: "corners", buffer: "UBL", letters: scheme.letters.corners ?? {}, orientedInPlace: "separate" });
      expect(c.value.targetStickers, scramble).toEqual(cornerExpected.targetStickers);
      expect(c.value.solvedPieces, scramble).toContain("DBL");
    }
  });

  it("wing and corner parity don't depend on the rotation chosen", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const scheme = speffzScheme(puzzle);
    const rng = createRng("frames-parity");
    const moves = verifiedMoves("4x4x4");
    for (let i = 0; i < 20; i++) {
      const scramble = randomMoveSequence(rng, moves, 30).join(" ");
      for (const pieceTypeId of ["wings", "corners"] as const) {
        const buffer = pieceTypeId === "wings" ? "DFr" : "UBL";
        const parities = new Set(
          wholeCubeRotationAlgs(puzzle).map((r) => {
            const result = trace(puzzle, { alg: scramble }, { pieceType: pieceTypeId, buffer, scheme, frame: { kind: "rotation", alg: r.alg === "" ? "x x x x" : r.alg } });
            if (!result.ok) throw new Error(JSON.stringify(result.error));
            return result.value.parity;
          }),
        );
        expect(parities.size, `${scramble} ${pieceTypeId}`).toBe(1);
      }
    }
  });
});
