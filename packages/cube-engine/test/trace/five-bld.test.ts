import { describe, expect, it } from "vitest";
import { loadPuzzle, movesDisagreeingWithGeometry, verifiedMoves } from "../../src/core/puzzle.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { compileLettering } from "../../src/lettering/scheme.js";
import { pieceTypesFor } from "../../src/pieces/piece-types.js";
import { createRng } from "../../src/random/prng.js";
import { randomMoveSequence } from "../../src/random/random-state.js";
import { trace } from "../../src/trace/trace.js";
import { TraceOracle } from "../oracle/trace-oracle.js";
import { XCentreOracle } from "../oracle/xcentre-oracle.js";

describe("5BLD family foundation", () => {
  it("maps every sticker and independently verifies every allowed move", async () => {
    const puzzle = await loadPuzzle("5x5x5");
    const slots = puzzle.stickerMap.orbits.flatMap((orbit) => orbit.slots.flat());
    expect(new Set(slots).size).toBe(150);
    expect(slots).toHaveLength(150);
    expect(movesDisagreeingWithGeometry(puzzle,verifiedMoves(puzzle.id))).toEqual([]);
  });
  it("keeps all five movable families in separate correctly lettered orbits", async () => {
    const puzzle = await loadPuzzle("5x5x5");
    const scheme = speffzScheme(puzzle);
    const families = pieceTypesFor(puzzle);
    expect(families.map((type) => [type.id,type.pieces.length,type.orientationOrder])).toEqual([["corners",8,3],["midges",12,2],["wings",24,1],["xcenters",24,1],["tcenters",24,1]]);
    expect(new Set(families.map((type) => type.orbit)).size).toBe(5);
    for (const type of families) expect(compileLettering(puzzle,scheme,type.id).ok).toBe(true);
  });
  it.each(["corners","midges","wings"] as const)("agrees with independent colour tracing and virtual-swap replay for %s", async (family) => {
    const puzzle = await loadPuzzle("5x5x5"); const scheme = speffzScheme(puzzle);
    const oracle = new TraceOracle(5,family);
    const rng = createRng(`five-${family}`);
    for (let i=0;i<60;i++) {
      const alg = randomMoveSequence(rng,verifiedMoves(puzzle.id),35).join(" ");
      const buffer = Object.keys(scheme.letters[family] ?? {})[rng.int(24)] ?? "";
      const result = trace(puzzle,{ alg },{ pieceType: family,buffer,scheme,frame:{ kind:"asIs" },policy:{ orientedInPlace:"asTargets" } });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      const colours = oracle.coloursAfter(alg);
      const expected = oracle.trace(colours,{ kind:family,buffer,letters:scheme.letters[family] ?? {},orientedInPlace:"asTargets" });
      expect(result.value.targetStickers).toEqual(expected.targetStickers);
      expect(result.value.targetKinds).toEqual(expected.kinds);
      expect(result.value.parity).toBe(expected.parity);
      for (const target of result.value.targetStickers) oracle.swap(colours,oracle.slotNamed(buffer),oracle.slotNamed(target));
      for (let j=0;j<oracle.cubies.length;j++) expect(oracle.isSolved(colours,j)).toBe(true);
    }
  });
  it.each(["xcenters","tcenters"] as const)("agrees with independent interchangeable-colour tracing for %s", async (family) => {
    const puzzle = await loadPuzzle("5x5x5"); const scheme = speffzScheme(puzzle);
    const oracle = new XCentreOracle(5,family); const rng = createRng(`five-${family}`);
    for (let i=0;i<60;i++) {
      const alg = randomMoveSequence(rng,verifiedMoves(puzzle.id),40).join(" ");
      const buffer = Object.keys(scheme.letters[family] ?? {})[rng.int(24)] ?? "";
      const result = trace(puzzle,{ alg },{ pieceType:family,buffer,scheme,frame:{ kind:"asIs" } });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      const expected = oracle.trace(oracle.coloursAfter(alg),{ buffer,letters:scheme.letters[family] ?? {},sameColour:"avoidBufferColour" });
      expect(result.value.targetStickers).toEqual(expected.targetStickers);
      for (const slot of oracle.slots) expect(expected.finalColours[slot]).toBe(oracle.home(slot));
    }
  });
});
