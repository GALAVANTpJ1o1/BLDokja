"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Segmented } from "@/components/trainer/trainer-shell";
import { TransitionLink } from "@/components/transitions/transition-link";
import { fetchArchivedMonths, fetchLeaderboard, fetchMonthlyArchive, type LeaderboardBoard, type LeaderboardRow } from "@/lib/leaderboards";
import { leaderboard as copy } from "@/i18n/leaderboard";
import { en } from "@/i18n/en";

const BOARDS: readonly LeaderboardBoard[] = ["streaks", "activeDays", "pointsDaily", "pointsWeekly", "pointsMonthly"];
type Tab = "live" | "archive";

function Table({ rows }: { rows: readonly LeaderboardRow[] }) {
  if (rows.length === 0) return <p className="t-body text-quiet">{copy.empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full t-meta">
        <thead>
          <tr className="text-left text-quiet">
            <th scope="col" className="py-1 pr-4 font-[500]">{copy.rank}</th>
            <th scope="col" className="py-1 pr-4 font-[500]">{copy.name}</th>
            <th scope="col" className="py-1 pr-4 font-[500]">{copy.value}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${String(row.rank)}-${row.displayName}`} className="border-t border-rule">
              <td className="py-1 pr-4 mono">{row.rank}</td>
              <td className="py-1 pr-4">{row.displayName}</td>
              <td className="py-1 pr-4 mono">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BoardResult {
  readonly board: LeaderboardBoard;
  readonly rows: LeaderboardRow[] | undefined;
}

function LiveBoards() {
  const [board, setBoard] = useState<LeaderboardBoard>("streaks");
  // Keyed by which board it answers, not reset-then-filled: a synchronous setState at the top of an
  // effect (to clear stale rows before fetching) triggers react-hooks/set-state-in-effect. Comparing
  // result.board to the current board below derives "still loading this board" instead.
  const [result, setResult] = useState<BoardResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetchLeaderboard(board).then((rows) => {
      if (!cancelled) setResult({ board, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [board]);

  const loading = result === undefined || result.board !== board;
  const rows = loading ? undefined : result.rows;

  return (
    <div className="flex flex-col gap-4" data-guide="leaderboard-table">
      <Segmented<LeaderboardBoard> label={copy.board} options={BOARDS} labels={copy.boards} value={board} onChange={setBoard} />
      <p className="t-meta text-quiet">{copy.boardHints[board]}</p>
      {loading ? <p className="t-body text-quiet">{copy.loading}</p> : rows === undefined ? <p className="t-body">{copy.failed}</p> : <Table rows={rows} />}
    </div>
  );
}

function monthLabel(iso: string): string {
  const [year, month] = iso.split("-");
  if (year === undefined || month === undefined) return iso;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

interface ArchiveResult {
  readonly month: string;
  readonly rows: LeaderboardRow[] | undefined;
}

function ArchiveBoard() {
  const [months, setMonths] = useState<string[] | undefined>(undefined);
  const [month, setMonth] = useState<string | undefined>(undefined);
  // Same keyed-result approach as LiveBoards, for the same reason.
  const [result, setResult] = useState<ArchiveResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetchArchivedMonths().then((fetched) => {
      if (cancelled) return;
      setMonths(fetched ?? []);
      setMonth(fetched?.[0]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (month === undefined) return;
    let cancelled = false;
    void fetchMonthlyArchive(month).then((rows) => {
      if (!cancelled) setResult({ month, rows: rows ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, [month]);

  if (months !== undefined && months.length === 0) return <p className="t-body text-quiet">{copy.archiveEmpty}</p>;

  const loading = month === undefined || result === undefined || result.month !== month;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 t-ui max-w-64">
        {copy.archiveMonth}
        <select className="field" value={month ?? ""} onChange={(e) => { setMonth(e.target.value); }}>
          {(months ?? []).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </label>
      {loading ? <p className="t-body text-quiet">{copy.loading}</p> : <Table rows={result.rows ?? []} />}
    </div>
  );
}

export function LeaderboardView() {
  const { configured } = useAccount();
  const [tab, setTab] = useState<Tab>("live");

  if (!configured) {
    return (
      <div className="settings-stack">
        <header className="settings-heading"><h1 className="t-title">{copy.title}</h1></header>
        <p className="t-body">{copy.notConfigured}</p>
      </div>
    );
  }

  return (
    <div className="settings-stack">
      <header className="settings-heading">
        <h1 className="t-title">{copy.title}</h1>
        <p className="t-body">{copy.intro}</p>
      </header>
      <Segmented<Tab> guide="leaderboard-controls" label={copy.tab} options={["live", "archive"]} labels={{ live: copy.tabLive, archive: copy.tabArchive }} value={tab} onChange={setTab} />
      {tab === "live" ? <LiveBoards /> : <ArchiveBoard />}
      <p className="t-meta text-quiet"><TransitionLink href="/account/" className="text-link">{copy.optInHint}</TransitionLink> · <TransitionLink href="/progress/" className="text-link">{en.nav.progress}</TransitionLink></p>
    </div>
  );
}
