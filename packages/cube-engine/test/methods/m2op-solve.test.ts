import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle, verifiedMoves, type Puzzle } from "../../src/core/puzzle.js";
import { formatMoves } from "../../src/commutator/expand.js";
import type { AlgMove } from "../../src/commutator/parse.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { m2OpSystem, solveM2Op } from "../../src/methods/m2.js";
import { stepMoves, type MethodSolution, type MethodStep } from "../../src/methods/solution.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { createRng, shuffled, type Rng } from "../../src/random/prng.js";
import { randomMoveSequence, randomState3x3 } from "../../src/random/random-state.js";
import type { TraceInput } from "../../src/trace/trace.js";
import { reverseGreekScheme } from "../fixtures/construct.js";
import { m2System, m2Systems } from "./op-systems.js";

const SPECIAL = ["UF", "FU", "DB", "BD"];

function solvesIt(puzzle: Puzzle, input: TraceInput, moves: string): boolean {
  const pattern = "pattern" in input ? input.pattern : puzzle.kpuzzle.defaultPattern().applyAlg(input.alg);
  return pattern.applyAlg(moves).isIdentical(puzzle.kpuzzle.defaultPattern());
}

const WIDE_AND_ROTATIONS = ["Uw", "Rw", "Fw", "x", "y", "z", "M", "E", "S"];

function randomInput(puzzle: Puzzle, rng: Rng): TraceInput {
  if (rng.int(2) === 0) return { pattern: randomState3x3(puzzle, rng) };
  const moves = verifiedMoves("3x3x3");
  const tail = moves.filter((m) => WIDE_AND_ROTATIONS.includes(m.replace(/['2]/g, "")));
  return { alg: [...randomMoveSequence(rng, moves, 20), ...randomMoveSequence(rng, tail, 2)].join(" ") };
}

const movesOf = (steps: readonly MethodStep[]) => formatMoves(steps.flatMap((s) => [...stepMoves(s)]));

/** Shape invariants of an M2/OP solution, besides solving the cube. */
function checkShape(solution: MethodSolution, oddStepRule: readonly { target: string; shootAs: string }[], context: string): void {
  const { corners, edges } = solution.traces;
  const edgeSteps = solution.steps.filter((s) => s.kind === "target" && s.pieceType === "edges");
  const cornerSteps = solution.steps.filter((s) => s.kind === "target" && s.pieceType === "corners");
  expect(edgeSteps.map((s) => (s.kind === "target" ? s.target : "")), context).toEqual(edges.targetStickers);
  expect(cornerSteps.map((s) => (s.kind === "target" ? s.target : "")), context).toEqual(corners.targetStickers);
  // shotAs appears exactly on odd steps whose target the rule maps.
  for (const step of edgeSteps) {
    if (step.kind !== "target") continue;
    const mapped = step.traceIndex % 2 === 1 ? oddStepRule.find((r) => r.target === step.target)?.shootAs : undefined;
    expect(step.shotAs, `${context} step ${step.traceIndex}`).toBe(mapped);
  }
  const kinds = solution.steps.map((s) => s.kind);
  const expected = [...(kinds[0] === "frame" ? ["frame"] : []), ...edgeSteps.map(() => "target"), ...(edges.parity ? ["parity"] : []), ...cornerSteps.map(() => "target")];
  expect(kinds, context).toEqual(expected);
  expect(formatMoves(solution.moves), context).toBe(movesOf(solution.steps));
}

describe("M2/OP full solve: default system (UBL, DF)", () => {
  it("solves 1,000 seeded random states and scrambles, across schemes and break orders, checked in kpuzzle and the geometry model", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const system = m2System(puzzle, "UBL", "DF");
    const schemes = [speffzScheme(puzzle), reverseGreekScheme(puzzle)];
    const stickers = [...pieceType(puzzle, "corners").stickers, ...pieceType(puzzle, "edges").stickers].map((s) => s.name);
    const rng = createRng("m2-op full solve");
    let withParity = 0;
    let shotAs = 0;
    let evenSpecials = 0;
    for (let run = 0; run < 1000; run++) {
      const input = randomInput(puzzle, rng);
      const scheme = schemes[run % 2] ?? speffzScheme(puzzle);
      const breakOrder = run % 3 === 0 ? shuffled(rng, stickers) : undefined;
      const context = `run ${run}: ${"alg" in input ? input.alg : "random state"}`;
      const solution = solveM2Op(puzzle, input, { scheme, ...system, ...(breakOrder === undefined ? {} : { breakOrder }) });
      if (!solution.ok) throw new Error(`${context}: ${JSON.stringify(solution.error)}`);
      const moves = formatMoves(solution.value.moves);
      expect(solvesIt(puzzle, input, moves), context).toBe(true);
      if ("alg" in input) {
        expect(geometryAlgPermutation(puzzle.geometry, `${input.alg} ${moves}`).every((to, from) => to === from), `${context} (geometry model)`).toBe(true);
      }
      checkShape(solution.value, system.edges.oddStepRule, context);
      if (solution.value.traces.edges.parity) withParity++;
      for (const step of solution.value.steps) {
        if (step.kind !== "target" || step.pieceType !== "edges") continue;
        if (step.shotAs !== undefined) shotAs++;
        else if (SPECIAL.includes(step.target)) evenSpecials++;
      }
    }
    // Every branch is exercised in earnest.
    expect(withParity).toBeGreaterThan(400);
    expect(shotAs).toBeGreaterThan(400);
    expect(evenSpecials).toBeGreaterThan(400);
  });
});

describe("M2/OP full solve: every symmetric buffer pair", () => {
  it("8 systems, 30 seeded runs each", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const systems = m2Systems(puzzle);
    expect(systems.map((s) => `${s.corners.buffer}/${s.edges.buffer}`).sort()).toEqual(["DBL/UF", "DBR/UF", "DFL/UB", "DFR/UB", "UBL/DF", "UBR/DF", "UFL/DB", "UFR/DB"]);
    const scheme = speffzScheme(puzzle);
    const rng = createRng("m2-op symmetric systems");
    for (const system of systems) {
      for (let run = 0; run < 30; run++) {
        const input = randomInput(puzzle, rng);
        const context = `${system.corners.buffer}/${system.edges.buffer} run ${run}`;
        const solution = solveM2Op(puzzle, input, { scheme, ...system });
        if (!solution.ok) throw new Error(`${context}: ${JSON.stringify(solution.error)}`);
        expect(solvesIt(puzzle, input, formatMoves(solution.value.moves)), context).toBe(true);
        checkShape(solution.value, system.edges.oddStepRule, context);
      }
    }
  });
});

describe("M2/OP teeth and findings", () => {
  it("ignoring the odd/even rule fails, leaving out parity fails, a tempting setup fails; parity after the corners also solves", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const system = m2System(puzzle, "UBL", "DF");
    const noRule = { ...system, edges: { ...system.edges, oddStepRule: [] } };
    const scheme = speffzScheme(puzzle);
    const rng = createRng("m2-op teeth");
    const counts = { ruleApplied: 0, parity: 0, parityLast: 0, tempting: 0 };
    const tempting = system.edges.tempting.find((t) => t.target === "UR");
    if (tempting === undefined) throw new Error("no tempting setup for UR");
    expect(tempting.setup).toBe("U'");
    for (let run = 0; run < 300; run++) {
      const input: TraceInput = { pattern: randomState3x3(puzzle, rng) };
      const solution = solveM2Op(puzzle, input, { scheme, ...system });
      if (!solution.ok) throw new Error(JSON.stringify(solution.error));
      const { steps } = solution.value;

      if (steps.some((s) => s.kind === "target" && s.shotAs !== undefined)) {
        counts.ruleApplied++;
        const without = solveM2Op(puzzle, input, { scheme, ...noRule });
        if (!without.ok) throw new Error(JSON.stringify(without.error));
        expect(solvesIt(puzzle, input, formatMoves(without.value.moves)), `run ${run}: rule ignored`).toBe(false);
      }
      if (solution.value.traces.edges.parity) {
        counts.parity++;
        const noParity = steps.filter((s) => s.kind !== "parity");
        expect(solvesIt(puzzle, input, movesOf(noParity)), `run ${run}: no parity`).toBe(false);
        // Finding (D-025): nothing the parity alg fixes touches corners, so it also works last.
        expect(solvesIt(puzzle, input, movesOf([...noParity, ...steps.filter((s) => s.kind === "parity")])), `run ${run}: parity last`).toBe(true);
        counts.parityLast++;
      }
      const index = steps.findIndex((s) => s.kind === "target" && s.pieceType === "edges" && s.target === "UR");
      const step = steps[index];
      if (step?.kind === "target") {
        const setup: AlgMove[] = [{ type: "move", family: "U", amount: 3 }];
        const broken = steps.map((s, i) => (i === index ? { ...step, setup, undo: [{ type: "move" as const, family: "U", amount: 1 as const }] } : s));
        expect(solvesIt(puzzle, input, movesOf(broken)), `run ${run}: tempting setup`).toBe(false);
        counts.tempting++;
      }
    }
    expect(counts.ruleApplied).toBeGreaterThan(100);
    expect(counts.parity).toBeGreaterThan(100);
    expect(counts.parityLast).toBe(counts.parity);
    expect(counts.tempting).toBeGreaterThan(20);
  });
});

describe("M2/OP worked example", () => {
  it("golden fixture R02 (parity, UF on an even step, BD on an odd step): the full solution, pinned for a physical cube", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const system = m2System(puzzle, "UBL", "DF");
    const scramble = "F' D2' L2' D B2' D2' L2' D' R2' U' B2' U' R' U2' B' U F' D R B' L";
    const solution = solveM2Op(puzzle, { alg: scramble }, { scheme: speffzScheme(puzzle), ...system });
    if (!solution.ok) throw new Error(JSON.stringify(solution.error));
    const { traces, steps } = solution.value;
    expect(traces.edges.targets.join(" ")).toBe("A D C S B L P T H B G V G");
    expect(traces.corners.targets.join(" ")).toBe("U B M S I V B O W");
    const lines = steps.map((s) => {
      if (s.kind === "parity") return `parity: ${formatMoves(s.alg)}`;
      if (s.kind !== "target") return s.kind;
      if (s.pieceType === "corners") return `corners ${s.target}: ${formatMoves(s.setup)}`;
      return `edges ${s.target}${s.shotAs === undefined ? "" : ` as ${s.shotAs}`}: ${formatMoves([...s.setup, ...s.core, ...s.undo])}`;
    });
    expect(lines).toEqual([
      "edges UB: M2",
      "edges UL: F U F' M2 F U' F'",
      "edges UF: U2 M' U2 M'",
      "edges BD as FU: D M' D B2 D' M D B2 D2 M2",
      "edges UR: F U' F' M2 F U F'",
      "edges FL: U' L' U M2 U' L U",
      "edges RF: F' U2 F M2 F' U2 F",
      "edges BR: U R' U' M2 U R U'",
      "edges LB: D B' D' M2 D B D'",
      "edges UR: F U' F' M2 F U F'",
      "edges LD: B L B' M2 B L' B'",
      "edges DR: U R2 U' M2 U R2 U'",
      "edges LD: B L B' M2 B L' B'",
      "parity: U' F2 U M2 U' F2 U",
      "corners DFL: F'",
      "corners UBR: R D'",
      "corners RUF: R'",
      "corners BDL: D' R",
      "corners FUL: F' D",
      "corners DFR: D' F'",
      "corners UBR: R D'",
      "corners RDB: R",
      "corners DBR: D2 F'",
    ]);
    expect(solvesIt(puzzle, { alg: scramble }, formatMoves(solution.value.moves))).toBe(true);
  });
});

describe("M2/OP errors", () => {
  it("reports mismatched datasets and unsupported buffer pairs", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const system = m2System(puzzle, "UBL", "DF");
    const other = m2System(puzzle, "UBR", "DF");
    const scheme = speffzScheme(puzzle);
    const code = (r: ReturnType<typeof solveM2Op>) => (r.ok ? "ok" : r.error.code);
    expect(code(solveM2Op(puzzle, { alg: "R U" }, { scheme, ...system, parity: other.parity }))).toBe("dataset-mismatch");
    expect(code(solveM2Op(puzzle, { alg: "R Q" }, { scheme, ...system }))).toBe("trace");
    const unsupported = m2OpSystem(puzzle, { cornerBuffer: "UFR", edgeBuffer: "DF" });
    expect(unsupported.ok ? "ok" : unsupported.error).toEqual({ code: "no-verified-m2-system", cornerBuffer: "UFR", edgeBuffer: "DF" });
    const notM = m2OpSystem(puzzle, { cornerBuffer: "UBL", edgeBuffer: "UR" });
    expect(notM.ok ? "ok" : notM.error.code).toBe("no-verified-m2-system");
  });
});
