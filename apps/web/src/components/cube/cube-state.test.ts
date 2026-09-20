import { loadPuzzle, stickerName, type Puzzle } from "@bld/cube-engine";
import { beforeAll, describe, expect, it } from "vitest";
import { isFixedCentre, netCells, pieceContext, playerMask, revealedCells } from "./cube-state";

/** The scramble on the "Tracing a cycle" lesson that showed one lone green sticker and grey centres. */
const SCRAMBLE = "R' B2 R U2 B2 U2 R";

let cube: Puzzle;
let bigCube: Puzzle;
beforeAll(async () => {
  cube = await loadPuzzle("3x3x3");
  bigCube = await loadPuzzle("4x4x4");
});

const slotNamed = (puzzle: Puzzle, name: string): number => {
  const found = puzzle.geometry.stickers.find((s) => stickerName(puzzle.geometry, s.index) === name);
  if (found === undefined) throw new Error(`no sticker slot named ${name}`);
  return found.index;
};
const namesOf = (puzzle: Puzzle, indices: Iterable<number>): string[] => [...indices].map((i) => stickerName(puzzle.geometry, i)).sort();
const sortedLetters = (name: string): string => Array.from(name).sort().join("");

describe("the rest of a highlighted piece", () => {
  it("is every other sticker of the piece: the lone green sticker of the report comes with its two other colours", () => {
    const cells = netCells(cube, cube.kpuzzle.defaultPattern().applyAlg(SCRAMBLE));
    const buffer = slotNamed(cube, "UBL");
    const context = pieceContext(cells, new Set([buffer]));
    expect(namesOf(cube, context)).toEqual(["BUL", "LUB"]);
    // The piece sitting in the buffer is green-red-yellow: with only its green sticker, the answer could be I, J, K or L.
    const colours = [buffer, ...context].map((i) => cells[i]?.colour).sort();
    expect(colours).toEqual(["D", "F", "R"]);
  });

  it("follows the piece wherever it has moved: for any sticker, the rest of its piece is the rest of its corner or edge", () => {
    for (const alg of [SCRAMBLE, "R U R' U' F2 D L' B", "L2 D' B R2 U F' D2"]) {
      const cells = netCells(cube, cube.kpuzzle.defaultPattern().applyAlg(alg));
      for (const cell of cells) {
        const name = stickerName(cube.geometry, cell.index);
        const expected = cells
          .filter((other) => other.index !== cell.index && name.length > 1 && sortedLetters(stickerName(cube.geometry, other.index)) === sortedLetters(name))
          .map((other) => other.index);
        expect(namesOf(cube, pieceContext(cells, new Set([cell.index]))), `${alg}: ${name}`).toEqual(namesOf(cube, expected));
      }
    }
  });

  it("is empty for a centre, which has no other stickers", () => {
    const cells = netCells(cube, cube.kpuzzle.defaultPattern());
    expect(pieceContext(cells, new Set([slotNamed(cube, "U")])).size).toBe(0);
  });

  it("on a 4x4x4 pairs a wing with its other sticker, and leaves an x-centre alone", () => {
    const cells = netCells(bigCube, bigCube.kpuzzle.defaultPattern());
    const wing = bigCube.geometry.stickers.find((s) => stickerName(bigCube.geometry, s.index).length === 3 && /^[A-Z]{2}[a-z]$/.test(stickerName(bigCube.geometry, s.index)));
    const xCentre = bigCube.geometry.stickers.find((s) => /^[A-Z][a-z]{2}$/.test(stickerName(bigCube.geometry, s.index)));
    if (wing === undefined || xCentre === undefined) throw new Error("no wing or x-centre found");
    expect(pieceContext(cells, new Set([wing.index])).size).toBe(1);
    expect(pieceContext(cells, new Set([xCentre.index])).size).toBe(0);
  });
});

describe("fixed centres", () => {
  it("are the six face-middle stickers of a 3x3x3 and none on a 4x4x4, which has no fixed centre", () => {
    const three = netCells(cube, cube.kpuzzle.defaultPattern());
    expect(three.filter((c) => isFixedCentre(c, 3)).map((c) => c.slotFace).sort()).toEqual(["B", "D", "F", "L", "R", "U"]);
    expect(netCells(bigCube, bigCube.kpuzzle.defaultPattern()).some((c) => isFixedCentre(c, 4))).toBe(false);
  });

  it("stay revealed along with the highlighted piece when everything else is hidden", () => {
    const cells = netCells(cube, cube.kpuzzle.defaultPattern());
    const shown = revealedCells(cells, 3, new Set([slotNamed(cube, "UFR")]));
    expect(namesOf(cube, shown)).toEqual(["B", "D", "F", "FUR", "L", "R", "RUF", "U", "UFR"]);
  });
});

describe("the 3D player's mask", () => {
  const facelets = (mask: ReturnType<typeof playerMask>, orbit: string) => (mask.orbits[orbit]?.pieces ?? []).map((piece) => piece.facelets);

  it("shows everything when nothing is highlighted", () => {
    const mask = playerMask(cube, cube.kpuzzle.defaultPattern().applyAlg(SCRAMBLE), new Set());
    for (const orbit of Object.keys(mask.orbits)) for (const piece of facelets(mask, orbit)) expect(new Set(piece)).toEqual(new Set(["regular"]));
  });

  it("lights the whole piece under one named sticker, keeps every centre coloured, and greys the rest (the reported screen)", () => {
    const pattern = cube.kpuzzle.defaultPattern().applyAlg(SCRAMBLE);
    const mask = playerMask(cube, pattern, new Set(["UBL"]));

    // Centres: never dimmed, never hidden.
    for (const piece of facelets(mask, "CENTERS")) expect(new Set(piece)).toEqual(new Set(["regular"]));

    // The piece in the buffer is the one whose sticker "FDR" sits at UBL: all three of its stickers are lit...
    const home = slotNamed(cube, "FDR");
    const where = cube.stickerMap.slotOfSticker[home];
    if (where === undefined) throw new Error("no slot for FDR");
    const litOrbit = cube.stickerMap.orbits[where.orbitIndex]?.orbit ?? "";
    expect(facelets(mask, litOrbit)[where.position]).toEqual(["regular", "regular", "regular"]);

    // ...and every other corner and edge sticker is grey.
    const regularNonCentre = ["CORNERS", "EDGES"].flatMap((orbit) => facelets(mask, orbit).flat()).filter((f) => f === "regular");
    expect(regularNonCentre).toHaveLength(3);
    expect(["CORNERS", "EDGES"].flatMap((orbit) => facelets(mask, orbit).flat()).filter((f) => f === "ignored")).toHaveLength(24 + 24 - 3);
  });

  it("is the same mask whether one sticker of a piece is named or all of them", () => {
    const pattern = cube.kpuzzle.defaultPattern().applyAlg(SCRAMBLE);
    const one = playerMask(cube, pattern, new Set(["UBL"]));
    const all = playerMask(cube, pattern, new Set(["UBL", "LUB", "BUL"]));
    expect(one).toEqual(all);
  });

  it("never dims: every sticker is either shown in full colour or blacked out", () => {
    const pattern = cube.kpuzzle.defaultPattern().applyAlg(SCRAMBLE);
    const mask = playerMask(cube, pattern, new Set(["UBL"]));
    const values = ["CORNERS", "EDGES", "CENTERS"].flatMap((orbit) => facelets(mask, orbit).flat());
    expect(new Set(values)).toEqual(new Set(["regular", "ignored"]));
    for (const piece of facelets(mask, "CENTERS")) expect(new Set(piece)).toEqual(new Set(["regular"]));
  });

  it("on a 4x4x4 lights a wing's other sticker; centres there are x-centres, which are pieces to memorise, so they are not forced on", () => {
    const wing = bigCube.geometry.stickers.find((s) => /^[A-Z]{2}[a-z]$/.test(stickerName(bigCube.geometry, s.index)));
    if (wing === undefined) throw new Error("no wing found");
    const mask = playerMask(bigCube, bigCube.kpuzzle.defaultPattern(), new Set([stickerName(bigCube.geometry, wing.index)]));
    const lit = Object.entries(mask.orbits).flatMap(([orbit, data]) => data.pieces.flatMap((piece, position) => (piece.facelets.every((f) => f === "regular") ? [`${orbit}:${String(position)}`] : [])));
    expect(lit.filter((entry) => entry.startsWith("EDGES") || entry.startsWith("WINGS") || !entry.startsWith("CENTERS"))).toHaveLength(1);
    const xCentres = bigCube.stickerMap.orbits.find((o) => o.stickersPerPiece === 1);
    expect(xCentres).toBeDefined();
    expect(mask.orbits[xCentres?.orbit ?? ""]?.pieces.every((piece) => piece.facelets.every((f) => f === "ignored"))).toBe(true);
  });
});
