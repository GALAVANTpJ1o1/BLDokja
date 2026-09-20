import { loadPuzzle } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { bufferOrientations, GATE_B_BUFFERS, readerFor } from "./reader";

/** The buffer is a piece; which of its stickers you trace from is your choice (UBL or LUB for the corner, UR or RU for the edge). */
describe("buffer orientations in the reader", () => {
  it("lists every sticker of the piece, the one named first", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    expect(bufferOrientations(puzzle, "corners", "UBL")).toEqual(["UBL", expect.any(String), expect.any(String)]);
    expect([...bufferOrientations(puzzle, "corners", "LUB")].sort()).toEqual(["BUL", "LUB", "UBL"]);
    expect(bufferOrientations(puzzle, "corners", "LUB")[0]).toBe("LUB");
    expect([...bufferOrientations(puzzle, "edges", "RU")].sort()).toEqual(["RU", "UR"]);
    expect(bufferOrientations(puzzle, "corners", "nope")).toEqual([]);
  });

  it("uses another orientation of the OP and M2 buffer pieces, not the standard sticker", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const op = readerFor(puzzle, { buffers: { op: { corners: "LUB", edges: "RU" } } });
    expect(op.issues).toEqual([]);
    expect(op.buffers.op).toEqual({ corners: "LUB", edges: "RU" });
    const m2 = readerFor(puzzle, { buffers: { m2: { corners: "BUL", edges: "FD" } } });
    expect(m2.issues).toEqual([]);
    expect(m2.buffers.m2).toEqual({ corners: "BUL", edges: "FD" });
  });

  it("still refuses pieces the method cannot build, and the standard buffers stay in use", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    // UFR with UF is not a pair a symmetry of (UBL, UR) reaches, in any orientation.
    const reader = readerFor(puzzle, { buffers: { op: { corners: "FUR", edges: "FU" } } });
    expect(reader.issues).toEqual([{ kind: "buffers", method: "op", corners: "FUR", edges: "FU" }]);
    expect(reader.buffers.op).toEqual(GATE_B_BUFFERS.op);
  });
});
