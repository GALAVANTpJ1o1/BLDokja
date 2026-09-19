import type { AppEvent } from "@bld/storage";
import { describe, expect, it } from "vitest";
import { caseWeight, effectiveStatus, filterCases, foldStats, inferStatus, LL_TRAINER, trendOf, type CaseStat } from "./cfop-stats";

let n = 0;
const attempt = (caseId: string, correct: boolean, responseMs: number, detail: Record<string, string | number> = {}, trainer = LL_TRAINER): AppEvent => {
  n += 1;
  return { id: `e${n}`, type: "drill.attempt", at: new Date(Date.UTC(2026, 8, 19, 12, 0, n)).toISOString(), trainer, caseId, correct, responseMs, detail };
};

describe("CFOP case statistics", () => {
  it("folds attempts per case: accuracy, times, best, recent, confusion", () => {
    const events = [
      attempt("oll_27", true, 2000), attempt("oll_27", false, 3000, { answerCaseId: "oll_26" }), attempt("oll_27", false, 2500, { answerCaseId: "oll_26" }), attempt("oll_27", true, 1500),
      attempt("oll_26", true, 900), attempt("pll_t", true, 700, {}, "other-trainer"),
    ];
    const stats = foldStats(events, LL_TRAINER);
    const sune = stats.get("oll_27");
    expect(sune?.attempts).toBe(4);
    expect(sune?.accuracy).toBe(0.5);
    expect(sune?.averageMs).toBe(1750);
    expect(sune?.bestMs).toBe(1500);
    expect(sune?.mostCommonWrong).toBe("oll_26");
    expect(sune?.recent).toEqual([true, false, false, true]);
    expect(stats.has("pll_t")).toBe(false);
  });

  it("judges status from practice and lets a hand-set status win", () => {
    const streak = foldStats(Array.from({ length: 5 }, () => attempt("oll_21", true, 1800)), LL_TRAINER).get("oll_21");
    const slow = foldStats(Array.from({ length: 5 }, () => attempt("oll_22", true, 9000)), LL_TRAINER).get("oll_22");
    const shaky = foldStats([attempt("oll_23", true, 1000), attempt("oll_23", false, 1000)], LL_TRAINER).get("oll_23");
    expect(inferStatus(undefined)).toBe("unlearned");
    expect(inferStatus(streak)).toBe("learned");
    expect(inferStatus(slow)).toBe("learning");
    expect(inferStatus(shaky)).toBe("learning");
    expect(effectiveStatus("oll_21", streak, { oll_21: "learning" })).toEqual({ value: "learning", manual: true, inferred: "learned" });
    expect(effectiveStatus("oll_21", streak, {})).toEqual({ value: "learned", manual: false, inferred: "learned" });
  });

  it("detects a trend from the last six correct times", () => {
    expect(trendOf([3000, 3000, 3000])).toBe("unknown");
    expect(trendOf([3000, 3000, 3000, 1500, 1500, 1500])).toBe("faster");
    expect(trendOf([1500, 1500, 1500, 3000, 3000, 3000])).toBe("slower");
    expect(trendOf([2000, 2000, 2000, 2000, 2100, 1900])).toBe("steady");
  });

  it("filters cases for practice: learning, weak, slowest, recently wrong, never seen", () => {
    const events = [
      ...Array.from({ length: 5 }, () => attempt("a", true, 1000)),
      attempt("b", true, 5000), attempt("b", false, 5000), attempt("b", false, 5000),
      attempt("c", true, 8000), attempt("c", true, 8000),
    ];
    const stats = foldStats(events, LL_TRAINER);
    const ids = ["a", "b", "c", "d"];
    expect(filterCases(ids, stats, "all")).toEqual(ids);
    expect(filterCases(ids, stats, "weak")).toEqual(["b"]);
    expect(filterCases(ids, stats, "neverSeen")).toEqual(["d"]);
    expect(filterCases(ids, stats, "recentlyWrong")).toEqual(["b"]);
    expect(filterCases(ids, stats, "slowest")).toEqual(["c"]);
    expect(filterCases(ids, stats, "learning")).toEqual(["b", "c"]);
    expect(filterCases(ids, stats, "learning", { a: "learning" })).toEqual(["a", "b", "c"]);
  });

  it("weights unseen and struggling cases above mastered ones", () => {
    const stat = (accuracy: number): CaseStat => ({ caseId: "x", attempts: 10, correct: Math.round(accuracy * 10), accuracy, averageMs: 1000, bestMs: 800, recentMs: 900, trend: "steady", recent: [], wrongAnswers: {}, mostCommonWrong: undefined, lastAt: undefined, lastWrongAt: undefined, moves: 0, hints: 0, resets: 0 });
    expect(caseWeight(undefined)).toBeGreaterThan(caseWeight(stat(1)));
    expect(caseWeight(stat(0.4))).toBeGreaterThan(caseWeight(stat(0.9)));
  });
});
