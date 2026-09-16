import { loadPuzzle, solveOpOp, formatMoves } from "@bld/cube-engine";
import { describe, it, expect } from "vitest";
import { algDatasets } from "@/content/algs";
import { readerFor } from "@/lib/reader";
import { csvCell } from "@/lib/download";
import { debugSolve, type DebugInput } from "./dnf-debugger";
import { ergonomicCounts, ergonomicScore } from "./ergonomics";
import { composeScenes, reorder } from "./memory-workspace";

const input: DebugInput = { scramble: "R U", memoEdges: "", memoCorners: "", recallEdges: "", recallCorners: "", executed: "", intended: "", orientation: false, parityOmitted: false };
describe("DNF evidence", () => {
  it("recognises a verified complete solve without inventing a cause", async () => {
    const puzzle = await loadPuzzle("3x3x3"); const reader = readerFor(puzzle);
    const { opCorners,opEdges,opParity } = algDatasets();
    const solved = solveOpOp(puzzle,{ alg:input.scramble },{ scheme:reader.scheme,corners:opCorners,edges:opEdges,parity:opParity });
    if (!solved.ok) throw new Error("fixture solution failed");
    const result = debugSolve(reader,reader.buffers.op,{ ...input,executed:formatMoves(solved.value.moves) });
    expect(result?.solved).toBe(true); expect(result?.categories).toEqual([]);
  });
  it("separates recalled memo from execution-effect evidence", async () => {
    const reader = readerFor(await loadPuzzle("3x3x3"));
    const result = debugSolve(reader,reader.buffers.op,{ ...input,memoEdges:"AB",recallEdges:"AC",executed:"U",intended:"U'" });
    expect(result?.categories).toContain("recall"); expect(result?.categories).toContain("execution");
    expect(result?.differences.length).toBeGreaterThan(0); expect(result?.solved).toBe(false);
  });
  it("does not assert parity without an explicit omission report and odd initial permutations", async () => {
    const reader = readerFor(await loadPuzzle("3x3x3"));
    expect(debugSolve(reader,reader.buffers.op,{ ...input,scramble:"R",executed:"U" })?.categories).not.toContain("parity");
    expect(debugSolve(reader,reader.buffers.op,{ ...input,scramble:"R",executed:"U",parityOmitted:true })?.categories).toContain("parity");
    expect(debugSolve(reader,reader.buffers.op,{ ...input,scramble:"",executed:"U",parityOmitted:true })?.categories).not.toContain("parity");
  });
  it("rejects malformed algorithms and distinguishes missing execution", async () => {
    const reader = readerFor(await loadPuzzle("3x3x3"));
    expect(debugSolve(reader,reader.buffers.op,{ ...input,executed:"Q" })).toBeUndefined();
    expect(debugSolve(reader,reader.buffers.op,input)?.hasExecution).toBe(false);
  });
});
describe("local workbench helpers", () => {
  it("counts effect-preserving cancelled moves and never infers regrips", () => {
    expect(ergonomicCounts("R R' x M Rw")).toEqual({ moves:3,rotations:1,slices:1,wide:1 });
    expect(ergonomicScore("R", { rating:5 })).toBeLessThan(ergonomicScore("R", { rating:1 }));
    expect(ergonomicScore("R", { regrips:3 })).toBeGreaterThan(ergonomicScore("R", {}));
  });
  it("builds stories only from personal words and keeps order, repeats and images", () => {
    let id=0;
    const pairs = [{ id:"AB",first:"A",second:"B",images:[{ id:"image",text:"my apple",uses:0 }] }];
    const result = composeScenes("AB AB",pairs,() => String(++id));
    expect(result.scenes.map((scene) => scene.pairId)).toEqual(["AB","AB"]);
    expect(result.scenes.map((scene) => scene.imageId)).toEqual(["image","image"]);
    expect(composeScenes("AB CD",pairs,() => "x").missing).toEqual(["CD"]);
    expect(reorder([1,2,3],0,2)).toEqual([2,3,1]);
    expect(reorder([1,2],-1,0)).toEqual([1,2]);
  });
  it("neutralises formula injection in CSV", () => {
    expect(csvCell("=SUM(1,2)")).toBe('"\'=SUM(1,2)"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});
