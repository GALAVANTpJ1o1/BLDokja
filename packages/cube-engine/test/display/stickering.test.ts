import { cube3x3x3 } from "cubing/puzzles";
import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { stickerName } from "../../src/pieces/names.js";
import { createRng } from "../../src/random/prng.js";
import { randomMoveSequence } from "../../src/random/random-state.js";
import { verifiedMoves } from "../../src/core/puzzle.js";
import { slotViews, stickeringMask } from "../../src/display/stickering.js";

describe("player stickering masks", () => {
  it("the player's 3D stickers carry the (orbit, position, label) of their solved slot, checked by position in space", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const pg = await cube3x3x3.pg();
    const dat = pg.get3d();
    const seen = new Set<number>();
    for (const s of dat.stickers) {
      if (s.isDup === true) continue;
      const n = s.coords.length / 3;
      const centre = [0, 1, 2].map((k) => s.coords.filter((_, i) => i % 3 === k).reduce((a, b) => a + b, 0) / n);
      const scale = puzzle.size / Math.max(...centre.map(Math.abs));
      let best = -1;
      let bestDistance = Infinity;
      puzzle.geometry.stickers.forEach((sticker, i) => {
        const d = sticker.position.reduce((acc, v, k) => acc + (v - (centre[k] ?? 0) * scale) ** 2, 0);
        if (d < bestDistance) [best, bestDistance] = [i, d];
      });
      expect(bestDistance).toBeLessThan(0.01);
      const slot = puzzle.stickerMap.slotOfSticker[best];
      expect({ orbit: puzzle.stickerMap.orbits[slot?.orbitIndex ?? -1]?.orbit, piece: slot?.position, facelet: slot?.label }).toEqual({ orbit: s.orbit, piece: s.ord, facelet: s.ori });
      seen.add(best);
    }
    expect(seen.size).toBe(54);
  });

  it("on scrambled states, the mask highlights exactly the chosen slots, checked with the geometry model", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const rng = createRng("stickering masks");
    const moves = verifiedMoves("3x3x3").filter((m) => /^[UDRLFB]/.test(m));
    for (let run = 0; run < 40; run++) {
      const alg = randomMoveSequence(rng, moves, 25).join(" ");
      const pattern = puzzle.kpuzzle.defaultPattern().applyAlg(alg);
      const chosen = new Set(Array.from({ length: 3 }, () => stickerName(puzzle.geometry, rng.int(54))));
      const mask = stickeringMask(puzzle, pattern, (v) => (chosen.has(v.slot) ? "regular" : "dim"));
      // Geometry model: perm[home] = the slot that home sticker is in after the alg.
      const perm = geometryAlgPermutation(puzzle.geometry, alg);
      for (const orbit of puzzle.stickerMap.orbits) {
        orbit.slots.forEach((labels, position) => {
          labels.forEach((home, label) => {
            const slot = stickerName(puzzle.geometry, perm[home] ?? -1);
            const facelet = mask.orbits[orbit.orbit]?.pieces[position]?.facelets[orbit.stickersPerPiece === 1 ? 0 : label];
            expect(facelet, `${alg}: ${stickerName(puzzle.geometry, home)} in ${slot}`).toBe(chosen.has(slot) ? "regular" : "dim");
          });
        });
      }
      expect(slotViews(puzzle, pattern).filter((v) => chosen.has(v.slot))).toHaveLength(chosen.size);
    }
  });

  it("on a 4x4, wings and corners are lit slot by slot, and x-centres by colour (D-040)", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const rng = createRng("4x4 stickering masks");
    const moves = verifiedMoves("4x4x4").filter((m) => /^(?:[UDRLFB]|2[UDRLFB]|[UDRLFB]w)['2]?$/.test(m));
    const centres = puzzle.stickerMap.orbits.find((o) => o.stickersPerPiece === 1);
    if (centres === undefined) throw new Error("no centre orbit");
    for (let run = 0; run < 20; run++) {
      const alg = randomMoveSequence(rng, moves, 30).join(" ");
      const pattern = puzzle.kpuzzle.defaultPattern().applyAlg(alg);
      const chosen = new Set(Array.from({ length: 4 }, () => stickerName(puzzle.geometry, rng.int(puzzle.geometry.stickerCount))));
      const mask = stickeringMask(puzzle, pattern, (v) => (chosen.has(v.slot) ? "regular" : "dim"));
      const perm = geometryAlgPermutation(puzzle.geometry, alg);
      // Which centre colours (piece values) sit in a chosen slot.
      const litValues = new Set<number>();
      centres.slots.forEach((labels, position) => {
        const home = labels[0] ?? -1;
        if (chosen.has(stickerName(puzzle.geometry, perm[home] ?? -1))) litValues.add(centres.defaultPieces[position] ?? -1);
      });
      for (const orbit of puzzle.stickerMap.orbits) {
        orbit.slots.forEach((labels, position) => {
          labels.forEach((home, label) => {
            const slot = stickerName(puzzle.geometry, perm[home] ?? -1);
            if (orbit.stickersPerPiece === 1) {
              const lit = litValues.has(orbit.defaultPieces[position] ?? -1);
              for (const facelet of mask.orbits[orbit.orbit]?.pieces[position]?.facelets ?? []) expect(facelet, `${alg}: centre ${stickerName(puzzle.geometry, home)}`).toBe(lit ? "regular" : "dim");
            } else {
              expect(mask.orbits[orbit.orbit]?.pieces[position]?.facelets[label], `${alg}: ${stickerName(puzzle.geometry, home)} in ${slot}`).toBe(chosen.has(slot) ? "regular" : "dim");
            }
          });
        });
      }
    }
  });
});
