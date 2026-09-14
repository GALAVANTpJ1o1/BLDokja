import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ADVERSARIAL_FLOOR,
  caseWeakness,
  createSelector,
  defaultRecencyWindow,
  SELECTION_STRATEGIES,
  selectionWeights,
  WEAKNESS_FLOOR,
  type CaseStats,
  type CaseStatsProvider,
  type SelectionContext,
  type SelectionStrategy,
  type Selector,
} from "../../src/random/selection.js";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `case${i}`);

function selector(strategy: SelectionStrategy, cases: readonly string[], seed: string | number, recency?: number): Selector {
  const created = createSelector({ strategy, cases, seed, ...(recency === undefined ? {} : { recency }) });
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return created.value;
}

function draw(s: Selector, count: number, context?: SelectionContext): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const picked = s.next(context);
    if (!picked.ok) throw new Error(JSON.stringify(picked.error));
    out.push(picked.value);
  }
  return out;
}

function counts(picks: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of picks) out.set(p, (out.get(p) ?? 0) + 1);
  return out;
}

const fromRecord =
  (record: Record<string, CaseStats>): CaseStatsProvider =>
  (caseId) =>
    record[caseId];

describe("defaultRecencyWindow", () => {
  it("is a quarter of the set clamped to 1..10, and never more than size − 1", () => {
    const table = [0, 1, 2, 3, 4, 7, 8, 22, 40, 41, 440, 576].map((size) => [size, defaultRecencyWindow(size)]);
    expect(table).toEqual([[0, 0], [1, 0], [2, 1], [3, 1], [4, 1], [7, 1], [8, 2], [22, 5], [40, 10], [41, 10], [440, 10], [576, 10]]);
  });
});

describe("createSelector", () => {
  it("rejects an empty set, duplicate ids, a bad recency and an unknown strategy", () => {
    const code = (options: Parameters<typeof createSelector>[0]) => {
      const r = createSelector(options);
      return r.ok ? "ok" : r.error.code;
    };
    expect(code({ strategy: "uniform", cases: [], seed: "s" })).toBe("empty-set");
    expect(code({ strategy: "uniform", cases: ["a", "b", "a"], seed: "s" })).toBe("duplicate-case");
    for (const recency of [-1, 1.5, Number.NaN]) expect(code({ strategy: "uniform", cases: ["a", "b"], seed: "s", recency })).toBe("invalid-recency");
    expect(code({ strategy: "random" as SelectionStrategy, cases: ["a"], seed: "s" })).toBe("unknown-strategy");
  });

  it("caps the window at size − 1 and uses the default otherwise", () => {
    expect(selector("uniform", ids(4), "s", 9).recency).toBe(3);
    expect(selector("uniform", ids(22), "s").recency).toBe(5);
    expect(selector("uniform", ids(1), "s", 5).recency).toBe(0);
    expect(selector("uniform", ids(22), "s", 0).recency).toBe(0);
  });

  it("copies the case list, so later edits to the caller's array change nothing", () => {
    const cases = ["a", "b", "c"];
    const s = selector("coverage", cases, "copy", 0);
    cases.push("d");
    expect(new Set(draw(s, 30))).toEqual(new Set(["a", "b", "c"]));
  });
});

describe("determinism", () => {
  const stats = fromRecord(Object.fromEntries(ids(12).map((id, i) => [id, { attempts: 10, errors: i % 7, retrievability: (i % 5) / 5, due: i * 1000 }])));
  const context = { stats, now: 1_000_000 };

  it.each(SELECTION_STRATEGIES)("%s gives the same sequence for the same seed and stats", (strategy) => {
    expect(draw(selector(strategy, ids(12), "replay me"), 200, context)).toEqual(draw(selector(strategy, ids(12), "replay me"), 200, context));
  });

  it.each(["uniform", "coverage", "weakness", "adversarial"] as const)("%s differs between seeds", (strategy) => {
    expect(draw(selector(strategy, ids(12), "seed one"), 60, context)).not.toEqual(draw(selector(strategy, ids(12), "seed two"), 60, context));
  });

  it("pins a short uniform sequence, so a change in sampling shows up", () => {
    expect(draw(selector("uniform", ["A", "B", "C", "D", "E", "F"], "pinned", 0), 12)).toEqual(["A", "E", "F", "F", "C", "A", "A", "B", "B", "A", "A", "F"]);
  });
});

const statsArbitrary = fc.record(
  {
    attempts: fc.integer({ min: 0, max: 50 }),
    errorShare: fc.double({ min: 0, max: 1, noNaN: true }),
    retrievability: fc.double({ min: 0, max: 1, noNaN: true }),
    due: fc.integer({ min: 0, max: 100 }),
  },
  { requiredKeys: ["attempts", "errorShare"] },
);

describe("recency guard (property)", () => {
  it("no case repeats within the window, for every strategy, set size, window and stats", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 25 }),
        fc.constantFrom(...SELECTION_STRATEGIES),
        fc.option(fc.integer({ min: 0, max: 30 }), { nil: undefined }),
        fc.integer(),
        fc.array(fc.option(statsArbitrary, { nil: undefined }), { minLength: 25, maxLength: 25 }),
        (size, strategy, recency, seed, rawStats) => {
          const cases = ids(size);
          const record: Record<string, CaseStats> = {};
          cases.forEach((id, i) => {
            const raw = rawStats[i];
            if (raw === undefined) return;
            const { errorShare, ...rest } = raw;
            record[id] = { ...rest, errors: Math.floor(errorShare * raw.attempts) };
          });
          const s = selector(strategy, cases, seed, recency);
          const picks: string[] = [];
          for (let i = 0; i < 120; i++) {
            const picked = s.next({ stats: fromRecord(record), now: 100 });
            if (picked.ok) picks.push(picked.value);
            else expect(strategy).toBe("spaced");
          }
          // Every run of window + 1 consecutive picks is distinct.
          for (let i = 0; i + s.recency < picks.length; i++) {
            expect(new Set(picks.slice(i, i + s.recency + 1)).size).toBe(s.recency + 1);
          }
          if (strategy !== "spaced") expect(picks).toHaveLength(120);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("coverage", () => {
  it("every case appears once before any repeats, in every round, whatever the window (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.option(fc.integer({ min: 0, max: 40 }), { nil: undefined }), fc.string(), (size, recency, seed) => {
        const s = selector("coverage", ids(size), seed, recency);
        const picks = draw(s, size * 6);
        for (let round = 0; round < 6; round++) {
          expect(new Set(picks.slice(round * size, (round + 1) * size)).size).toBe(size);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("with the window at size − 1 it becomes a strict rotation", () => {
    const picks = draw(selector("coverage", ids(4), "rotate", 3), 16);
    expect(picks.slice(4)).toEqual([...picks.slice(0, 4), ...picks.slice(0, 4), ...picks.slice(0, 4)]);
  });
});

describe("uniform", () => {
  it("is roughly even with no window", () => {
    const tally = counts(draw(selector("uniform", ids(10), "even", 0), 10_000));
    for (const id of ids(10)) {
      expect(tally.get(id)).toBeGreaterThan(850);
      expect(tally.get(id)).toBeLessThan(1150);
    }
  });
});

describe("weakness and adversarial", () => {
  const fiveLevels = fromRecord(Object.fromEntries([0, 5, 10, 15, 20].map((errors, i) => [`case${i}`, { attempts: 20, errors }])));

  it("caseWeakness smooths the error rate and averages it with forgetting", () => {
    expect(caseWeakness({ attempts: 0, errors: 0 })).toBe(0.5);
    expect(caseWeakness({ attempts: 8, errors: 2 })).toBe(0.3);
    expect(caseWeakness({ attempts: 8, errors: 2, retrievability: 0.9 })).toBeCloseTo(0.2, 12);
  });

  it("gives exact weights: floor + w for weakness, floor + w⁴ for adversarial", () => {
    const w = [1, 6, 11, 16, 21].map((e) => e / 22);
    const weakness = selectionWeights("weakness", ids(5), fiveLevels);
    const adversarial = selectionWeights("adversarial", ids(5), fiveLevels);
    if (!weakness.ok || !adversarial.ok) throw new Error("weights failed");
    weakness.value.forEach((v, i) => { expect(v).toBeCloseTo(WEAKNESS_FLOOR + (w[i] ?? 0), 12); });
    adversarial.value.forEach((v, i) => { expect(v).toBeCloseTo(ADVERSARIAL_FLOOR + (w[i] ?? 0) ** 4, 12); });
  });

  it("weights a never-drilled case as the weakest case that has history, or fully weak if none has", () => {
    const partly = fromRecord({ case0: { attempts: 20, errors: 0 }, case1: { attempts: 20, errors: 10 }, case2: { attempts: 0, errors: 0, retrievability: 0.5 } });
    const weights = selectionWeights("weakness", ["case0", "case1", "case2", "never"], partly);
    if (!weights.ok) throw new Error("weights failed");
    const worst = Math.max(...(weights.value.slice(0, 3)));
    expect(weights.value[3]).toBe(worst);
    expect(worst).toBeCloseTo(WEAKNESS_FLOOR + 0.5, 12);
    const none = selectionWeights("adversarial", ids(3), undefined);
    expect(none.ok && none.value).toEqual([1 + ADVERSARIAL_FLOOR, 1 + ADVERSARIAL_FLOOR, 1 + ADVERSARIAL_FLOOR]);
  });

  it("picks weaker cases more often, and adversarial far more so", () => {
    const tallies = (strategy: "weakness" | "adversarial") => {
      const tally = counts(draw(selector(strategy, ids(5), `order ${strategy}`, 0), 20_000, { stats: fiveLevels }));
      return ids(5).map((id) => tally.get(id) ?? 0);
    };
    const weakness = tallies("weakness");
    const adversarial = tallies("adversarial");
    for (let i = 1; i < 5; i++) {
      expect(weakness[i]).toBeGreaterThan(weakness[i - 1] ?? 0);
      expect(adversarial[i]).toBeGreaterThan(adversarial[i - 1] ?? 0);
    }
    // Expected shares of the weakest case: about 36% and 70%.
    expect(weakness[4]).toBeGreaterThan(20_000 * 0.32);
    expect(weakness[4]).toBeLessThan(20_000 * 0.41);
    expect(adversarial[4]).toBeGreaterThan(20_000 * 0.65);
    expect(adversarial[0]).toBeGreaterThan(0);
  });

  it("reports invalid stats instead of sampling with them", () => {
    for (const bad of [{ attempts: -1, errors: 0 }, { attempts: 2, errors: 3 }, { attempts: 2.5, errors: 0 }, { attempts: 2, errors: 1, retrievability: 1.5 }]) {
      const picked = selector("weakness", ids(3), "bad").next({ stats: fromRecord({ case1: bad }) });
      expect(picked.ok ? "ok" : picked.error).toMatchObject({ reason: "invalid-stats", caseId: "case1" });
    }
  });
});

describe("spaced", () => {
  const due = fromRecord({
    a: { attempts: 3, errors: 0, due: 500, retrievability: 0.8 },
    b: { attempts: 3, errors: 1, due: 100, retrievability: 0.9 },
    c: { attempts: 3, errors: 1, due: 100, retrievability: 0.6 },
    d: { attempts: 3, errors: 0, due: 5_000 },
    e: { attempts: 0, errors: 0 },
  });

  it("follows the due queue: most overdue first, then least retrievable; never picks what isn't due", () => {
    const s = selector("spaced", ["a", "b", "c", "d", "e"], "queue", 2);
    expect(draw(s, 3, { stats: due, now: 1_000 })).toEqual(["c", "b", "a"]);
  });

  it("returns nothing-due, counting due cases hidden by the recency window", () => {
    const s = selector("spaced", ["a", "b", "c", "d", "e"], "queue", 2);
    expect(s.next({ stats: due, now: 50 })).toEqual({ ok: false, error: { reason: "nothing-due", dueButRecent: 0 } });
    expect(draw(s, 2, { stats: due, now: 200 })).toEqual(["c", "b"]);
    expect(s.next({ stats: due, now: 200 })).toEqual({ ok: false, error: { reason: "nothing-due", dueButRecent: 2 } });
    expect(s.recent()).toEqual(["c", "b"]);
  });

  it("needs a time", () => {
    expect(selector("spaced", ["a"], "t").next({ stats: due })).toEqual({ ok: false, error: { reason: "missing-now" } });
  });
});
