/**
 * Copy for the public leaderboards (v2 §H). Its own topic file, following the convention in
 * i18n/account.ts, i18n/contact.ts etc.: components import `leaderboard` directly rather than
 * through the merged `en` dictionary.
 */
export const leaderboard = {
  title: "Leaderboards",
  viewLink: "See the leaderboards",
  metaDescription: "Opt-in practice leaderboards: current streak, active days and points, with a monthly hall of fame. Self-reported, so friendly rather than verified.",
  intro: "Opt-in and read-only, and viewable without an account. Rankings are added up on the server from the practice records each account syncs, but those records come from each person's own browser and aren't independently checked, so treat the boards as friendly rather than verified.",
  notConfigured: "Leaderboards aren't available in this build yet.",
  optInHint: "Opt in, or set a public display name, from your account.",
  loading: "Loading…",
  failed: "Couldn't load this board. Try again shortly.",
  empty: "No one has opted in yet. Be the first, from your account.",
  rank: "Rank",
  name: "Name",
  value: "Value",
  board: "Board",
  boards: {
    streaks: "Streak",
    activeDays: "Active days",
    pointsDaily: "Points, today",
    pointsWeekly: "Points, this week",
    pointsMonthly: "Points, this month",
  },
  boardHints: {
    streaks: "Longest current run of consecutive active days, in each person's own local time.",
    activeDays: "Distinct days practised this week (Monday to Sunday).",
    pointsDaily: "One point per graded attempt today, capped at 20.",
    pointsWeekly: "This week's daily points, added up (Monday to Sunday).",
    pointsMonthly: "This month's daily points, added up so far.",
  },
  tab: "View",
  tabLive: "This period",
  tabArchive: "Past months",
  archiveMonth: "Month",
  archiveEmpty: "No month has finished yet with anyone opted in.",
} as const;
