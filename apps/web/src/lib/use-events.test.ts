import { DrillAttemptEventSchema } from "@bld/storage";
import { describe, expect, it } from "vitest";
import { settingsSnapshot } from "./use-events";

describe("settings snapshot on attempts", () => {
  it("records difficulty, buffers and scheme as plain JSON the event schema accepts", () => {
    const snapshot = settingsSnapshot({ difficulty: { time: { mode: "hard", seconds: 3 }, relook: false }, buffers: { op: { corners: "DBL", edges: "BR" } }, scheme: { id: "mine", name: "Mine", letters: {} } });
    expect(snapshot).toEqual({ difficulty: { time: { mode: "hard", seconds: 3 }, relook: false }, buffers: { op: { corners: "DBL", edges: "BR" } }, scheme: "mine" });
    expect(settingsSnapshot(undefined)).toEqual({ difficulty: {}, buffers: "standard", scheme: "speffz" });
    const event = { id: "e", type: "drill.attempt", at: "2026-09-16T10:00:00Z", trainer: "pairs", caseId: "AB", correct: true, responseMs: 900, settings: settingsSnapshot({ difficulty: { seed: "x" } }) };
    expect(DrillAttemptEventSchema.safeParse(event).success).toBe(true);
  });
});
