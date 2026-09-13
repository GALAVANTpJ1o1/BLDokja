import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { compileLettering, parseScheme, type Scheme } from "../../src/lettering/scheme.js";
import { blankScheme, speffzScheme } from "../../src/lettering/speffz.js";

function withCorners(base: Scheme, corners: Record<string, string>): Scheme {
  return { ...base, letters: { ...base.letters, corners } };
}

describe("scheme validation", () => {
  it("rejects a letter used for two stickers of the same piece type", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const base = speffzScheme(puzzle);
    const scheme = withCorners(base, { ...base.letters.corners, FUR: "A" });
    const result = compileLettering(puzzle, scheme, "corners");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContainEqual({ code: "duplicate-letter", pieceType: "corners", letter: "A", stickers: ["UBL", "FUR"] });
    }
  });

  it("allows the same letter on a corner and an edge (they are separate piece types)", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    expect(scheme.letters.corners?.UBL).toBe(scheme.letters.edges?.UB);
    expect(compileLettering(puzzle, scheme, "corners").ok).toBe(true);
    expect(compileLettering(puzzle, scheme, "edges").ok).toBe(true);
  });

  it("reports gaps, unknown stickers and non-letters, all at once", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const base = speffzScheme(puzzle);
    const corners: Record<string, string> = { ...base.letters.corners, XYZ: "Z", RUF: "MM", DBL: " " };
    delete corners.UFR;
    const result = compileLettering(puzzle, withCorners(base, corners), "corners");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.error.map((issue) => issue.code).sort();
      // UFR is missing and RUF is invalid (both on piece UFR); DBL is invalid (piece DBL).
      expect(codes).toEqual(["missing-letter", "missing-letter", "not-a-single-letter", "not-a-single-letter", "unknown-sticker"]);
      expect(result.error).toContainEqual({ code: "missing-letter", pieceType: "corners", piece: "UFR", unlettered: ["UFR", "RUF"] });
    }
  });

  it("requires exactly one lettered sticker per wing", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const base = speffzScheme(puzzle);
    const wings = { ...base.letters.wings, BUl: "Ω" };
    const result = compileLettering(puzzle, { ...base, letters: { ...base.letters, wings } }, "wings");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContainEqual({ code: "too-many-letters", pieceType: "wings", piece: "UBl", lettered: ["UBl", "BUl"] });
  });

  it("accepts any single graphemes, including non-Latin letters", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const base = speffzScheme(puzzle);
    const greek = "Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω".split(" ");
    const corners = Object.fromEntries(Object.keys(base.letters.corners ?? {}).map((sticker, i) => [sticker, greek[i] ?? "?"]));
    const result = compileLettering(puzzle, withCorners(base, corners), "corners");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stickerOf("Α")?.name).toBe("UBL");
  });

  it("gives a blank template that is well-formed but reports every missing letter", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const result = compileLettering(puzzle, blankScheme(puzzle, "mine", "My scheme"), "edges");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.filter((i) => i.code === "missing-letter")).toHaveLength(12);
  });

  it("rejects piece types that the puzzle doesn't have", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const result = compileLettering(puzzle, speffzScheme(puzzle), "edges");
    expect(result).toEqual({ ok: false, error: [{ code: "piece-type-not-on-puzzle", pieceType: "edges" }] });
  });
});

describe("parseScheme (untrusted JSON)", () => {
  it("round-trips Speffz through JSON", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const json: unknown = JSON.parse(JSON.stringify(speffzScheme(puzzle)));
    const parsed = parseScheme(puzzle, json);
    expect(parsed.ok).toBe(true);
  });

  it.each([
    ["a missing format marker", { id: "x", name: "x", puzzle: "3x3x3", version: 1, letters: {} }],
    ["a malformed sticker key", { format: "bld-platform/scheme", version: 1, id: "x", name: "x", puzzle: "3x3x3", letters: { corners: { "<b>": "A" } } }],
    ["an unknown piece type", { format: "bld-platform/scheme", version: 1, id: "x", name: "x", puzzle: "3x3x3", letters: { midges: {} } }],
    ["a non-object", "speffz"],
  ])("rejects %s with a Zod error", async (_label, input) => {
    const puzzle = await loadPuzzle("3x3x3");
    const parsed = parseScheme(puzzle, input);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.zod).toBeDefined();
  });

  it("rejects a scheme for another puzzle", async () => {
    const three = await loadPuzzle("3x3x3");
    const four = await loadPuzzle("4x4x4");
    const parsed = parseScheme(three, speffzScheme(four));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.issues).toEqual([{ code: "wrong-puzzle", expected: "3x3x3", actual: "4x4x4" }]);
  });
});
