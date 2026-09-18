import { z } from "zod";
import { getSupabase } from "@/lib/supabase-client";

/**
 * Client-side reads of the read-only leaderboard functions (supabase/migrations/20260918100006_leaderboards.sql,
 * D-059). Every board is `anon`-callable and returns only {display_name, rank, value} for opted-in
 * users -- this file never sees a username, an email, or raw event history.
 *
 * `rank`/`value` are declared `bigint` in some of these functions; PostgREST's JSON encoding of
 * bigint isn't assumed here (a leaderboard is exactly the kind of externally-reachable boundary
 * BRIEF's Zod rule means), so both are coerced rather than required to already be a JS number.
 */
const RowSchema = z.object({ display_name: z.string(), rank: z.coerce.number(), value: z.coerce.number() }).strict();
const RowsSchema = z.array(RowSchema);
const MonthsSchema = z.array(z.string());

export interface LeaderboardRow {
  readonly displayName: string;
  readonly rank: number;
  readonly value: number;
}

export type LeaderboardBoard = "streaks" | "activeDays" | "pointsDaily" | "pointsWeekly" | "pointsMonthly";

const BOARD_RPC: Readonly<Record<LeaderboardBoard, string>> = {
  streaks: "leaderboard_streaks",
  activeDays: "leaderboard_weekly_active_days",
  pointsDaily: "leaderboard_points_daily",
  pointsWeekly: "leaderboard_points_weekly",
  pointsMonthly: "leaderboard_points_monthly",
};

/** Narrower than SupabaseClient, mirroring lib/sync/settings.ts's SettingsSyncClient -- enough surface to fake in a test, no real network. */
export interface LeaderboardClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function toRows(data: unknown): LeaderboardRow[] | undefined {
  const parsed = RowsSchema.safeParse(data);
  if (!parsed.success) return undefined;
  return parsed.data.map((row) => ({ displayName: row.display_name, rank: row.rank, value: row.value }));
}

/** undefined means "couldn't load" (network/shape failure) -- distinct from an empty board, which is a valid, real result. */
export async function fetchLeaderboard(board: LeaderboardBoard, client: LeaderboardClient = getSupabase()): Promise<LeaderboardRow[] | undefined> {
  const { data, error } = await client.rpc(BOARD_RPC[board]);
  if (error) return undefined;
  return toRows(data);
}

export async function fetchArchivedMonths(client: LeaderboardClient = getSupabase()): Promise<string[] | undefined> {
  const { data, error } = await client.rpc("leaderboard_archived_months");
  if (error) return undefined;
  const parsed = MonthsSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

/** monthStart: any date within the target month, "YYYY-MM-DD" -- the function itself truncates to that month's start. */
export async function fetchMonthlyArchive(monthStart: string, client: LeaderboardClient = getSupabase()): Promise<LeaderboardRow[] | undefined> {
  const { data, error } = await client.rpc("leaderboard_points_monthly_archive", { target_month: monthStart });
  if (error) return undefined;
  return toRows(data);
}
