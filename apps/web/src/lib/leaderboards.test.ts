import { describe, expect, it } from "vitest";
import { fetchArchivedMonths, fetchLeaderboard, fetchMonthlyArchive, type LeaderboardClient } from "./leaderboards";

type Reply = { data: unknown; error: { message: string } | null };

function fake(reply: Reply): LeaderboardClient & { calls: { fn: string; args: Record<string, unknown> | undefined }[] } {
  const calls: { fn: string; args: Record<string, unknown> | undefined }[] = [];
  return {
    calls,
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(reply);
    },
  };
}

describe("fetchLeaderboard", () => {
  it("calls the RPC that belongs to each board", async () => {
    const client = fake({ data: [], error: null });
    for (const board of ["streaks", "activeDays", "pointsDaily", "pointsWeekly", "pointsMonthly"] as const) await fetchLeaderboard(board, client);
    expect(client.calls.map((c) => c.fn)).toEqual(["leaderboard_streaks", "leaderboard_weekly_active_days", "leaderboard_points_daily", "leaderboard_points_weekly", "leaderboard_points_monthly"]);
  });

  it("maps snake_case rows and accepts bigint values that arrive as strings", async () => {
    const client = fake({ data: [{ display_name: "Ana", rank: "1", value: "42" }, { display_name: "Bo", rank: 2, value: 7 }], error: null });
    expect(await fetchLeaderboard("pointsWeekly", client)).toEqual([
      { displayName: "Ana", rank: 1, value: 42 },
      { displayName: "Bo", rank: 2, value: 7 },
    ]);
  });

  it("an empty board is a real, empty result, not a failure", async () => {
    expect(await fetchLeaderboard("streaks", fake({ data: [], error: null }))).toEqual([]);
  });

  it("returns undefined on an RPC error, so the page can say it couldn't load", async () => {
    expect(await fetchLeaderboard("streaks", fake({ data: null, error: { message: "boom" } }))).toBeUndefined();
  });

  it("rejects a row carrying anything beyond the public projection (e.g. a username)", async () => {
    const client = fake({ data: [{ display_name: "Ana", rank: 1, value: 3, username: "secret" }], error: null });
    expect(await fetchLeaderboard("streaks", client)).toBeUndefined();
  });

  it("rejects a malformed payload", async () => {
    expect(await fetchLeaderboard("streaks", fake({ data: { not: "an array" }, error: null }))).toBeUndefined();
    expect(await fetchLeaderboard("streaks", fake({ data: [{ display_name: 5, rank: 1, value: 1 }], error: null }))).toBeUndefined();
  });
});

describe("archive reads", () => {
  it("lists archived months", async () => {
    expect(await fetchArchivedMonths(fake({ data: ["2026-09-01", "2026-08-01"], error: null }))).toEqual(["2026-09-01", "2026-08-01"]);
    expect(await fetchArchivedMonths(fake({ data: null, error: { message: "x" } }))).toBeUndefined();
  });

  it("passes the month as target_month", async () => {
    const client = fake({ data: [{ display_name: "Ana", rank: 1, value: 300 }], error: null });
    expect(await fetchMonthlyArchive("2026-08-01", client)).toEqual([{ displayName: "Ana", rank: 1, value: 300 }]);
    expect(client.calls).toEqual([{ fn: "leaderboard_points_monthly_archive", args: { target_month: "2026-08-01" } }]);
  });
});
