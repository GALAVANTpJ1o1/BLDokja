import { describe, expect, it } from "vitest";
import { itemLabel, parseCase } from "./item-labels";

describe("case ids read back", () => {
  it("parses every trainer's case id format, and refuses anything else", () => {
    expect(parseCase("pairs", "AB")).toEqual({ trainer: "pairs", pair: "AB" });
    expect(parseCase("3style", "corners@UFR:UBR-UBL")).toEqual({ trainer: "3style", pieceType: "corners", buffer: "UFR", targets: ["UBR", "UBL"] });
    expect(parseCase("m2op", "op-corners:UBR")).toEqual({ trainer: "m2op", mode: "op-corners", buffer: undefined, target: "UBR", position: undefined });
    expect(parseCase("m2op", "m2-special@UF:FD:odd")).toEqual({ trainer: "m2op", mode: "m2-special", buffer: "UF", target: "FD", position: "odd" });
    expect(parseCase("trace", "edges:UF")).toEqual({ trainer: "trace", pieceType: "edges", sticker: "UF" });
    expect(parseCase("4bld", "r2:UBl")).toEqual({ trainer: "4bld", kind: "shot", method: "r2", target: "UBl", position: undefined });
    expect(parseCase("4bld", "u2:Ubl:odd")).toEqual({ trainer: "4bld", kind: "shot", method: "u2", target: "Ubl", position: "odd" });
    expect(parseCase("4bld", "trace-xcenters:Ufl")).toEqual({ trainer: "4bld", kind: "trace", pieces: "xcenters", sticker: "Ufl" });
    expect(parseCase("4bld", "m2:UBl")).toBeUndefined();
    expect(parseCase("3style", "corners:UBR-UBL")).toBeUndefined();
    expect(parseCase("other", "x")).toBeUndefined();
  });
});

describe("4BLD labels", () => {
  it("use the letter when the reader knows the sticker, and the sticker alone when it doesn't", () => {
    const fourBld = { letterOf: (s: string) => (s === "UBl" ? "A" : undefined) };
    expect(itemLabel(fourBld, "4bld", "r2:UBl")).toBe("r2 wings: A (UBl)");
    expect(itemLabel({ letterOf: () => undefined }, "4bld", "r2:UBl:odd")).toBe("r2 wings: UBl · odd position");
  });
});
