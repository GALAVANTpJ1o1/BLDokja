import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { createRng } from "../../src/random/prng.js";
import { CuratedSetSchema, firstTwoLayersIntact, type CuratedSet } from "../../src/cfop/curated.js";
import { firstStage, generateChain, LL_MODES, MODE_STAGES, validateChain, type LlSets } from "../../src/cfop/ll-trainer.js";
import { gradeStage, summarise, type StageRecord, type TrainerStage } from "../../src/cfop/trainer-core.js";
import { orientationFeatures, permutationFeatures, topView } from "../../src/cfop/recognition.js";
import { casePattern } from "../../src/cfop/curated.js";
import type { KPattern } from "cubing/kpuzzle";

const directory = join(import.meta.dirname, "../../../../content/algs/cfop/curated");
const load = (name: string): CuratedSet => CuratedSetSchema.parse(JSON.parse(readFileSync(join(directory, `${name}.json`), "utf8")));
const puzzle = await loadPuzzle("3x3x3");
const sets: LlSets = { eo: load("eo"), co: load("co"), cp: load("cp"), ep: load("ep"), oll: load("oll"), pll: load("pll") };

/** Play a whole session by answering every stage with its correct name and applying the executed algorithm to the same cube. */
function play(mode: (typeof LL_MODES)[number], start: KPattern): { stages: TrainerStage<KPattern>[]; end: KPattern } {
  const stages: TrainerStage<KPattern>[] = [];
  let stage = firstStage(puzzle, sets, mode, start);
  let state = start;
  while (stage !== null) {
    stages.push(stage);
    expect(stage.state.isIdentical(state)).toBe(true);
    const answer = stage.expected.kind === "case" ? stage.expected.label : "";
    expect(gradeStage(stage, { kind: "name", text: answer }, 0, 1500).correct).toBe(true);
    if (stage.metadata?.autoAdvance !== true) expect(gradeStage(stage, { kind: "name", text: "definitely wrong" }, 0, 1500).correct).toBe(false);
    expect(gradeStage(stage, { kind: "name", text: answer }, 100, 1500).elapsedMs).toBe(1400);
    const moves = stage.onSuccess?.kind === "apply" ? stage.onSuccess.moves : "";
    state = state.applyAlg(moves);
    expect(firstTwoLayersIntact(state)).toBe(true);
    stage = stage.nextStageGenerator?.(state) ?? null;
  }
  return { stages, end: state };
}

describe("last-layer recognition chains", () => {
  for (const mode of LL_MODES) {
    it(`${mode}: every stage is the state the previous algorithm produced, and the last leaves the cube solved`, () => {
      const rng = createRng(`chain-${mode}`);
      for (let i = 0; i < 25; i += 1) {
        const chain = generateChain(puzzle, sets, mode, rng);
        expect(chain).toBeDefined();
        if (chain === undefined) continue;
        const valid = validateChain(puzzle, sets, mode, chain);
        expect(valid.ok, mode).toBe(true);
        const { stages, end } = play(mode, chain.start);
        // Stage order follows the mode's graph; only the first case is planned, because a later stage is whatever the earlier
        // algorithms actually left (a symmetric case can be solved from more than one AUF, each leaving a different cube).
        const order = stages.map((s) => s.metadata?.stage);
        expect(order.every((stage) => MODE_STAGES[mode].includes(stage as never))).toBe(true);
        expect(stages[0]?.expected.kind === "case" ? stages[0].expected.caseId : "").toBe(chain.plan[0]?.caseId);
        const finalStage = MODE_STAGES[mode][MODE_STAGES[mode].length - 1];
        if (finalStage === "pll" || finalStage === "ep") expect(end.experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true })).toBe(true);
      }
    }, 120_000);
  }

  it("runs the 2-look last layer as EO, CO, CP, EP with one cube", () => {
    const chain = generateChain(puzzle, sets, "2look-ll", createRng("two-look"));
    if (chain === undefined) throw new Error("no chain");
    const { stages } = play("2look-ll", chain.start);
    const order = stages.map((s) => s.metadata?.stage);
    expect(order.slice(0, 2)).toEqual(["eo", "co"]);
    expect(order.slice(2).every((stage) => stage === "cp" || stage === "ep")).toBe(true);
  });

  it("filters the first stage to the cases asked for (weak cases)", () => {
    const rng = createRng("filter");
    for (let i = 0; i < 20; i += 1) {
      const chain = generateChain(puzzle, sets, "1look-oll", rng, "2H", { allowed: (_stage, c) => c.number === 27 || c.number === 26 });
      expect([26, 27]).toContain(Number(chain?.plan[0]?.caseId.slice(4)));
    }
  });

  it("summarises a session: accuracy, timing, weakest and most-confused cases", () => {
    const records: StageRecord[] = [
      { stageId: "a", caseId: "oll_27", stage: "oll", correct: true, recognitionMs: 1000, answer: "sune", hints: 0 },
      { stageId: "b", caseId: "oll_26", stage: "oll", correct: false, recognitionMs: 3000, answer: "sune", hints: 0 },
      { stageId: "c", caseId: "oll_26", stage: "oll", correct: false, recognitionMs: 2000, answer: "sune", hints: 1 },
      { stageId: "d", caseId: "oll_26", stage: "oll", correct: true, recognitionMs: 1400, answer: "anti-sune", hints: 0 },
    ];
    const summary = summarise(records);
    expect(summary.attempts).toBe(4);
    expect(summary.accuracy).toBe(0.5);
    expect(summary.weakest[0]).toBe("oll_26");
    expect(summary.confusedWith[0]).toEqual({ caseId: "oll_26", answered: "sune", times: 2 });
    expect(Math.round(summary.averageMs)).toBe(1200);
  });
});

describe("recognition features are read from the state", () => {
  it("sees the yellow edges of the Line and the headlights of the T permutation", () => {
    const line = sets.eo.cases.find((c) => c.id === "eo_line");
    const t = sets.pll.cases.find((c) => c.id === "pll_t");
    if (line === undefined || t === undefined) throw new Error("missing case");
    const edges = orientationFeatures(topView(puzzle, casePattern(puzzle, "eo", line.state)));
    expect(edges.orientedEdges).toBe(2);
    expect(edges.edgeSides.length).toBe(2);
    const features = permutationFeatures(topView(puzzle, casePattern(puzzle, "pll", t.state)));
    expect(features.headlights.length + features.bars.length).toBeGreaterThan(0);
  });
});
