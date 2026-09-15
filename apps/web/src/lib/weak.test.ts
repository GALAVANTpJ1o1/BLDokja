import { describe, expect, it } from "vitest";
import { weakDeck } from "./weak";

const attempt = (trainer: string, caseId: string, at: string, correct: boolean) => ({ type: "drill.attempt", at, trainer, caseId, correct, responseMs: 1500 });

describe("weak deck", () => {
  it("ranks a case you're likelier to have forgotten above an otherwise identical one", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    const events = [
      // Same accuracy and speed; AB was last seen months ago, CD this morning.
      attempt("pairs", "AB", "2026-05-01T10:00:00Z", true),
      attempt("pairs", "AB", "2026-05-02T10:00:00Z", false),
      attempt("pairs", "CD", "2026-09-15T10:00:00Z", false),
      attempt("pairs", "CD", "2026-09-16T10:00:00Z", true),
    ];
    const deck = weakDeck(events, now);
    expect(deck.map((w) => w.caseId)).toEqual(["AB", "CD"]);
    expect(deck[0]?.reasons).toContain("forgetting");
  });

  it("keeps each trainer's recall history separate and respects the limit", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    const events = [
      attempt("pairs", "AB", "2026-09-16T10:00:00Z", true),
      attempt("pairs", "AB", "2026-09-16T10:01:00Z", true),
      // The same case id in another trainer, never answered right.
      attempt("trace", "AB", "2026-05-01T10:00:00Z", false),
      attempt("trace", "AB", "2026-05-01T10:01:00Z", false),
      attempt("m2op", "op-corners:C", "2026-09-16T10:00:00Z", false),
      attempt("m2op", "op-corners:C", "2026-09-16T10:01:00Z", true),
    ];
    const deck = weakDeck(events, now);
    expect(deck.map((w) => `${w.trainer}|${w.caseId}`)).toEqual(["trace|AB", "m2op|op-corners:C", "pairs|AB"]);
    expect(weakDeck(events, now, 1)).toHaveLength(1);
  });
});
