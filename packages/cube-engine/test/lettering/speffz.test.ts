import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { compileLettering } from "../../src/lettering/scheme.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import type { PieceTypeId } from "../../src/pieces/piece-types.js";

/**
 * Speffz letters read off the reference net diagram (U above F; L F R B in a row; D below F;
 * each face lettered clockwise from its top-left), written out as explicit sticker → letter
 * facts. The rule-based builder must reproduce them exactly.
 *
 * Diagram source: github.com/Voltara/vcube doc/speffz.md; rule: Speedsolving wiki "Speffz".
 */
const SPEFFZ_3X3_CORNERS: Record<string, string> = {
  UBL: "A", UBR: "B", UFR: "C", UFL: "D",
  LUB: "E", LUF: "F", LDF: "G", LDB: "H",
  FUL: "I", FUR: "J", FDR: "K", FDL: "L",
  RUF: "M", RUB: "N", RDB: "O", RDF: "P",
  BUR: "Q", BUL: "R", BDL: "S", BDR: "T",
  DFL: "U", DFR: "V", DBR: "W", DBL: "X",
};

const SPEFFZ_3X3_EDGES: Record<string, string> = {
  UB: "A", UR: "B", UF: "C", UL: "D",
  LU: "E", LF: "F", LD: "G", LB: "H",
  FU: "I", FR: "J", FD: "K", FL: "L",
  RU: "M", RB: "N", RD: "O", RF: "P",
  BU: "Q", BL: "R", BD: "S", BR: "T",
  DF: "U", DR: "V", DB: "W", DL: "X",
};

describe("Speffz on 3x3x3", () => {
  it("matches the reference diagram for every corner sticker", async () => {
    const scheme = speffzScheme(await loadPuzzle("3x3x3"));
    expect(scheme.letters.corners).toEqual(SPEFFZ_3X3_CORNERS);
  });

  it("matches the reference diagram for every edge sticker", async () => {
    const scheme = speffzScheme(await loadPuzzle("3x3x3"));
    expect(scheme.letters.edges).toEqual(SPEFFZ_3X3_EDGES);
  });

  it("is a valid scheme for both piece types", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    for (const id of ["corners", "edges"] as const) {
      const lettering = compileLettering(puzzle, speffzScheme(puzzle), id);
      expect(lettering.ok).toBe(true);
      if (lettering.ok) expect(lettering.value.alphabet.join("")).toBe("ABCDEFGHIJKLMNOPQRSTUVWX");
    }
  });
});

describe("Speffz on 4x4x4", () => {
  it("letters corners exactly as on 3x3x3", async () => {
    const scheme = speffzScheme(await loadPuzzle("4x4x4"));
    expect(scheme.letters.corners).toEqual(SPEFFZ_3X3_CORNERS);
  });

  it("letters the wing clockwise-next to each corner, and the x-centre nearest each corner", async () => {
    const scheme = speffzScheme(await loadPuzzle("4x4x4"));
    // U face, from its net view (B at the top).
    expect(scheme.letters.wings).toMatchObject({ UBl: "A", URb: "B", UFr: "C", ULf: "D" });
    expect(scheme.letters.xcenters).toMatchObject({ Ubl: "A", Ubr: "B", Ufr: "C", Ufl: "D" });
    // F face, from its net view (U at the top).
    expect(scheme.letters.wings).toMatchObject({ FUl: "I", FRu: "J", FDr: "K", FLd: "L" });
  });

  it("gives every wing exactly one letter and is valid for all three piece types", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    for (const id of ["corners", "wings", "xcenters"] satisfies PieceTypeId[]) {
      const lettering = compileLettering(puzzle, speffzScheme(puzzle), id);
      if (!lettering.ok) throw new Error(JSON.stringify(lettering.error));
      expect(lettering.value.alphabet).toHaveLength(24);
    }
  });
});
