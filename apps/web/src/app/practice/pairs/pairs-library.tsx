"use client";

import { reviewsByCase, scheduleAll } from "@bld/srs";
import { useMemo, useState } from "react";
import { Segmented, TrainerShell, type Shortcut } from "@/components/trainer/trainer-shell";
import { en } from "@/i18n/en";
import { useReader } from "@/lib/reader";
import { readPreference, useEvents, writePreference } from "@/lib/use-events";
import { expectedOccurrence, libraryHealth, libraryLetters, PAIRS_TRAINER, seenPairs } from "@/trainers/pairs";
import frequencyReport from "../../../../../../docs/reports/letter-pair-frequencies.json";
import { SessionReport } from "@/components/trainer/session-report";
import { PairDrill, PairReview } from "./pair-cards";
import { PairEditor } from "./pair-editor";
import { PairGrid } from "./pair-grid";
import { PairData, PairDiscover, PairHealth, PairSentence } from "./pair-tools";
import type { LibraryContext } from "./pair-ui";
import { useLibrary } from "./use-library";

type Tab = keyof typeof en.pairs.tabs;
const TABS: readonly Tab[] = ["grid", "review", "drill", "discover", "health", "sentence", "data"];
const isTab = (v: unknown): v is Tab => typeof v === "string" && (TABS as readonly string[]).includes(v);

const SHORTCUTS: Readonly<Record<Tab, readonly Shortcut[]>> = {
  grid: [{ keys: en.pairs.keyArrows, action: en.pairs.keyArrowsAction }],
  review: [
    { keys: en.pairs.keyReveal, action: en.pairs.keyRevealAction },
    { keys: en.pairs.keyKnew, action: en.pairs.keyKnewAction },
    { keys: en.pairs.keyMissed, action: en.pairs.keyMissedAction },
  ],
  drill: [
    { keys: en.pairs.keyReveal, action: en.pairs.keyRevealAction },
    { keys: en.pairs.keyKnew, action: en.pairs.keyKnewAction },
    { keys: en.pairs.keyMissed, action: en.pairs.keyMissedAction },
    { keys: en.pairs.keyEnter, action: en.pairs.keyEnterAction },
  ],
  discover: [{ keys: en.pairs.keyEnter, action: en.pairs.discoverAdd }],
  health: [],
  sentence: [],
  data: [],
};

/**
 * The letter-pair library (BRIEF §7.4): the 24 × 24 grid and editor, an FSRS review queue, four drill
 * modes, word discovery, library health, memo sentences, and import and export. Schedules are rebuilt
 * from your drill history (trainer "pairs"); the gap finder ranks pairs by how often your guided-trace
 * sessions produced them, then by how often they occur for your buffers.
 */
export function PairsLibrary() {
  const reader = useReader();
  const { events, append } = useEvents();
  const { pairs, save } = useLibrary();
  const [tab, setTab] = useState<Tab>(() => readPreference("bld.pairs.tab", "grid", isTab));
  const [editing, setEditing] = useState<string | undefined>(undefined);

  const letters = useMemo(() => (reader === undefined ? [] : libraryLetters(reader.scheme)), [reader]);
  const expected = useMemo(() => (reader === undefined ? undefined : expectedOccurrence(frequencyReport, reader.buffers.op)), [reader]);
  const derived = useMemo(() => {
    const now = new Date();
    const ids = [...new Set([...letters.flatMap((a) => letters.map((b) => `${a}${b}`)), ...(pairs ?? []).map((p) => p.id)])];
    return { now, schedules: scheduleAll(ids, reviewsByCase(events ?? [], PAIRS_TRAINER), now), seen: seenPairs(events ?? []) };
  }, [letters, pairs, events]);
  const byId = useMemo(() => new Map((pairs ?? []).map((p) => [p.id, p])), [pairs]);

  const shell = (children: React.ReactNode) => (
    <TrainerShell title={en.pairs.title} intro={en.pairs.intro} lesson={{ href: "/learn/letter-pairs/", title: en.pairs.lessonTitle }} shortcuts={SHORTCUTS[tab]}>
      {children}
    </TrainerShell>
  );

  if (reader === undefined || pairs === undefined || events === undefined) return shell(<p className="t-meta text-quiet">{en.pairs.loading}</p>);

  const ctx: LibraryContext = { reader, letters, pairs, byId, schedules: derived.schedules, seen: derived.seen, expected, now: derived.now, save, append, events, openEditor: setEditing };
  const health = libraryHealth(pairs, letters, derived.seen, expected);

  return shell(
    <div className="flex flex-col gap-6">
      <Segmented<Tab>
        guide="pairs-views"
        label={en.pairs.tab}
        options={TABS}
        labels={en.pairs.tabs}
        value={tab}
        onChange={(v) => {
          setTab(v);
          writePreference("bld.pairs.tab", v);
        }}
      />
      {tab === "grid" ? <PairGrid ctx={ctx} /> : null}
      {tab === "review" ? <PairReview ctx={ctx} /> : null}
      {tab === "drill" ? <PairDrill ctx={ctx} /> : null}
      {tab === "review" || tab === "drill" ? <SessionReport reader={reader} trainer="pairs" events={events} /> : null}
      {tab === "discover" ? <PairDiscover ctx={ctx} health={health} /> : null}
      {tab === "health" ? <PairHealth ctx={ctx} health={health} /> : null}
      {tab === "sentence" ? <PairSentence ctx={ctx} /> : null}
      {tab === "data" ? <PairData ctx={ctx} /> : null}
      {editing !== undefined ? <PairEditor key={editing} ctx={ctx} id={editing} onClose={() => { setEditing(undefined); }} /> : null}
    </div>,
  );
}
