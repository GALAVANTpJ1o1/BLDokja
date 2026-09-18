import type { Metadata } from "next";
import { leaderboard } from "@/i18n/leaderboard";
import { LeaderboardView } from "./leaderboard-view";

export const metadata: Metadata = { title: leaderboard.title, description: leaderboard.intro, alternates: { canonical: "/leaderboard/" } };

export default function LeaderboardPage() {
  return <LeaderboardView />;
}
