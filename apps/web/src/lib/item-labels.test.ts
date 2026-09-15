import { describe, expect, it } from "vitest";
import { parseCase } from "./item-labels";

describe("case ids read back", () => {
  it("parses every trainer's case id format, and refuses anything else", () => {
    expect(parseCase("pairs", "AB")).toEqual({ trainer: "pairs", pair: "AB" });
    expect(parseCase("3style", "corners@UFR:UBR-UBL")).toEqual({ trainer: "3style", pieceType: "corners", buffer: "UFR", targets: ["UBR", "UBL"] });
    expect(parseCase("m2op", "op-corners:UBR")).toEqual({ trainer: "m2op", mode: "op-corners", buffer: undefined, target: "UBR", position: undefined });
    expect(parseCase("m2op", "m2-special@UF:FD:odd")).toEqual({ trainer: "m2op", mode: "m2-special", buffer: "UF", target: "FD", position: "odd" });
    expect(parseCase("trace", "edges:UF")).toEqual({ trainer: "trace", pieceType: "edges", sticker: "UF" });
    expect(parseCase("3style", "corners:UBR-UBL")).toBeUndefined();
    expect(parseCase("other", "x")).toBeUndefined();
  });
});
