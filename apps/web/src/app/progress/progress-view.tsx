"use client";

import { activityDays, attemptsOf, heatCells, legacyMemoSummary, LOOKUP_KINDS, MIN_SAMPLES, streaks, traceDiagnostics, trend, type Attempt, type LegacyMemoLike } from "@bld/analytics";
import { useMemo, useState } from "react";
import { BarRows, HeatGrid, TrendChart, type HeatDatum } from "@/components/charts/charts";
import { useSettings } from "@/components/settings/settings-provider";
import { Segmented } from "@/components/trainer/trainer-shell";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";
import { leaderboard } from "@/i18n/leaderboard";
import { polish } from "@/i18n/polish";
import { workspaces } from "@/i18n/workspaces";
import { itemLabel } from "@/lib/item-labels";
import { threeStyleForReader, useMethodData } from "@/lib/methods";
import { useReader } from "@/lib/reader";
import { useEvents } from "@/lib/use-events";
import { weakDeck } from "@/lib/weak";
import { gridStickers } from "@/trainers/three-style";
import { libraryLetters } from "@/trainers/pairs";

type Range = "30" | "90" | "all";
type TrainerKey = "trace" | "pairs" | "m2op" | "3style" | "4bld";
const TRAINERS: readonly TrainerKey[] = ["trace", "pairs", "m2op", "3style", "4bld"];
const localDay = (time: number) => new Date(time).toLocaleDateString("en-CA");

/**
 * Progress analytics (BRIEF §8). The period filter scopes trace diagnostics, trends, the letter-pair heatmap
 * and the 3-style grid. Weak 20 always covers all your history, like the deck it links to. All of it is
 * recomputed from the event log.
 */
export function ProgressView() {
  const reader = useReader();
  const { events } = useEvents();
  const [range, setRange] = useState<Range>("30");
  const [trainer, setTrainer] = useState<TrainerKey>("trace");
  const [pieces, setPieces] = useState<"corners" | "edges">("corners");
  const built = useMethodData(reader, threeStyleForReader);

  const all = useMemo(() => attemptsOf(events ?? []), [events]);
  const attempts = useMemo(() => {
    if (range === "all") return all;
    const since = new Date().getTime() - Number(range) * 86_400_000;
    return all.filter((a) => a.time >= since);
  }, [all, range]);

  const seconds = en.analytics.seconds;
  const percent = en.analytics.percent;

  // The page renders the title and intro; this view starts at the period filter.
  if (events === undefined || reader === undefined) return <p className="t-meta text-quiet">{en.cube.loading}</p>;

  const days = new Set(attempts.map((a) => localDay(a.time))).size;
  const correct = attempts.filter((a) => a.correct).length;

  return (
    <div className="progress-workbench flex flex-col gap-10">
      <p className="t-meta text-quiet">{polish.scramble.provisional}</p>
      <TransitionLink className="text-link self-start" href="/practice/levels/">{workspaces.levels.stats}</TransitionLink>
      <div className="progress-overview flex flex-col gap-4">
        <Segmented<Range> label={en.analytics.range} options={["30", "90", "all"]} labels={en.analytics.ranges} value={range} onChange={setRange} />
        <p className="t-body">
          {en.analytics.attempts(attempts.length)} · {en.analytics.days(days)}
          {attempts.length > 0 ? ` · ${en.analytics.accuracy(Math.round((correct / attempts.length) * 100))}` : ""}
        </p>
        {all.length === 0 ? <p className="t-body text-quiet">{en.analytics.empty}</p> : null}
      </div>

      <ActivityCalendar attempts={all} />

      <div className="progress-insights"><Diagnostics attempts={attempts} />

      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <h2 className="t-heading">{en.analytics.trendsTitle}</h2>
        <p className="t-meta text-quiet">{en.analytics.trendsCaption}</p>
        <Segmented<TrainerKey> label={en.analytics.trainer} options={TRAINERS} labels={en.analytics.trainers} value={trainer} onChange={setTrainer} />
        <Trends attempts={attempts.filter((a) => a.trainer === trainer)} name={en.analytics.trainers[trainer]} />
      </section>

      </div>
      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <Heatmap attempts={attempts} letters={libraryLetters(reader.scheme)} />
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <Segmented<"corners" | "edges"> label={en.threeStyle.pieces} options={["corners", "edges"]} labels={en.threeStyle.pieceTypes} value={pieces} onChange={setPieces} />
        {built?.ok === true ? (
          (() => {
            const dataset = built.value[pieces];
            const stickers = gridStickers(reader.puzzle, dataset, reader.scheme);
            const prefix = `${pieces}@${dataset.buffer}:`;
            const cells = heatCells(attempts, "3style", (id) => id.startsWith(prefix));
            const data = new Map<string, HeatDatum>();
            for (const record of dataset.records) {
              if (record.kind !== "cycle") continue;
              const id = `${prefix}${record.id}`;
              const cell = cells.get(id);
              const letters = `${reader.letterOf(record.targets[0]) ?? "?"}${reader.letterOf(record.targets[1]) ?? "?"}`;
              data.set(id, {
                id,
                row: record.targets[0],
                col: record.targets[1],
                speedStep: cell?.speedStep,
                band: cell?.accuracyBand,
                tooltip: cell === undefined ? `${letters}: —` : en.analytics.pairTooltip(letters, cell.attempts, percent(cell.accuracy), seconds(cell.medianMs)),
                tableRow: [letters, String(cell?.attempts ?? 0), cell === undefined ? "—" : percent(cell.accuracy), cell === undefined ? "—" : seconds(cell.medianMs)],
              });
            }
            return (
              <HeatGrid
                title={en.analytics.gridTitle(en.threeStyle.pieceTypes[pieces].toLowerCase(), dataset.buffer)}
                caption={en.analytics.gridCaption}
                rows={stickers.map((s) => ({ key: s, label: reader.letterOf(s) ?? "?" }))}
                cols={stickers.map((s) => ({ key: s, label: reader.letterOf(s) ?? "?" }))}
                rowLabel={en.analytics.firstTarget}
                colLabel={en.analytics.secondTarget}
                data={data}
                tableHead={en.analytics.caseHead}
                cellSize={18}
              />
            );
          })()
        ) : (
          <p className="t-meta text-quiet">{en.threeStyle.building}</p>
        )}
      </section>

      <WeakList events={events} />

      <LegacyMemos events={events} />

      <section className="flex flex-col gap-2 border-t border-rule pt-6">
        <h2 className="t-heading">{en.analytics.dataTitle}</h2>
        <p className="t-body text-quiet">{en.analytics.dataText}</p>
        <TransitionLink href="/settings/" className="t-body">{en.analytics.dataLink}</TransitionLink>
      </section>
    </div>
  );
}

/** DESIGN.md "states without colour" (mastery.tsx's RAMP): one lightness/opacity ramp, plus a size mark, never colour hue alone -- the classic GitHub calendar's green scale is exactly the pattern this project's own guardrails rule out. */
const INTENSITY_RAMP = [0, 0.35, 0.55, 0.75, 1] as const;
const WEEKS_SHOWN = 12;

function ActivityCalendar({ attempts }: { attempts: readonly Attempt[] }) {
  // Date.now() can't be called during render (react-hooks/purity), but a useState lazy initializer
  // runs exactly once at mount and is exempt -- the same pattern session-report.tsx already uses.
  const [now] = useState(() => Date.now());
  const { stored } = useSettings();
  const goal = stored?.dailyGoal;

  const days = useMemo(() => activityDays(attempts, { dayOf: localDay }), [attempts]);
  const today = useMemo(() => localDay(now), [now]);
  const streak = useMemo(() => streaks(attempts, { dayOf: localDay, today }), [attempts, today]);
  const [focused, setFocused] = useState<{ day: string; count: number } | undefined>(undefined);

  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d.attempts])), [days]);
  const todayCount = byDay.get(today) ?? 0;
  const weeks = useMemo(() => {
    const cells: { day: string; count: number }[] = [];
    const totalDays = WEEKS_SHOWN * 7;
    for (let i = totalDays - 1; i >= 0; i--) {
      const day = localDay(now - i * 86_400_000);
      cells.push({ day, count: byDay.get(day) ?? 0 });
    }
    const out: { day: string; count: number }[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [byDay, now]);
  const maxCount = Math.max(1, ...weeks.flat().map((c) => c.count));
  const levelOf = (n: number): 0 | 1 | 2 | 3 | 4 => (n === 0 ? 0 : n >= maxCount * 0.75 ? 4 : n >= maxCount * 0.5 ? 3 : n >= maxCount * 0.25 ? 2 : 1);

  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-6">
      <h2 className="t-heading">{en.analytics.activityTitle}</h2>
      <p className="t-body">{en.analytics.streakSummary(streak.current, streak.longest)}</p>
      {goal?.enabled === true ? (
        <p className="t-body">{todayCount >= goal.attempts ? en.analytics.dailyGoal.metToday(goal.attempts) : en.analytics.dailyGoal.progressToday(todayCount, goal.attempts)}</p>
      ) : null}
      {days.length === 0 ? (
        <p className="t-body text-quiet">{en.analytics.calendarEmpty}</p>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto py-1" role="img" aria-label={en.analytics.calendarLabel(days.length, streak.current)}>
            {weeks.map((week, weekIndex) => (
              <div key={week[0]?.day ?? `week-${weekIndex}`} className="flex flex-col gap-1">
                {week.map((cell) => {
                  const level = levelOf(cell.count);
                  return (
                    <button
                      key={cell.day}
                      type="button"
                      className="grid place-items-center rounded-[4px] border border-rule"
                      style={{ width: 14, height: 14, background: level === 0 ? "transparent" : `color-mix(in srgb, var(--text) ${Math.round(INTENSITY_RAMP[level] * 100)}%, transparent)` }}
                      onFocus={() => { setFocused({ day: cell.day, count: cell.count }); }}
                      onMouseEnter={() => { setFocused({ day: cell.day, count: cell.count }); }}
                    >
                      {cell.count > 0 ? <span aria-hidden style={{ width: 3 + level, height: 3 + level, borderRadius: 999, background: "var(--ground)" }} /> : null}
                      <span className="sr-only">{en.analytics.dayDetail(cell.day, cell.count)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="t-meta text-quiet" aria-live="polite">{focused !== undefined ? en.analytics.dayDetail(focused.day, focused.count) : en.analytics.dayDetailNone}</p>
          <div className="flex items-center gap-1 t-meta text-quiet">
            <span>{en.analytics.legendLess}</span>
            {INTENSITY_RAMP.map((opacity, level) => (
              <span key={level} aria-hidden className="rounded-[4px] border border-rule" style={{ width: 12, height: 12, background: level === 0 ? "transparent" : `color-mix(in srgb, var(--text) ${Math.round(opacity * 100)}%, transparent)` }} />
            ))}
            <span>{en.analytics.legendMore}</span>
          </div>
        </>
      )}
      <TransitionLink href="/leaderboard/" className="text-link self-start">{leaderboard.viewLink}</TransitionLink>
    </section>
  );
}

function Diagnostics({ attempts }: { attempts: readonly Attempt[] }) {
  const kinds = traceDiagnostics(attempts);
  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-6">
      <BarRows
        title={en.analytics.diagnosticsTitle}
        caption={en.analytics.diagnosticsCaption}
        unit={en.analytics.seconds_unit}
        rows={LOOKUP_KINDS.map((kind) => {
          const k = kinds.find((d) => d.kind === kind);
          return {
            label: en.analytics.kinds[kind],
            value: k?.enough === true ? k.medianMs : undefined,
            valueText: k?.medianMs === undefined ? "" : `${en.analytics.seconds(k.medianMs)} · ${en.analytics.percent(k.accuracy ?? 0)}`,
            note: en.analytics.notEnough(k?.count ?? 0, MIN_SAMPLES),
          };
        })}
      />
    </section>
  );
}

function Trends({ attempts, name }: { attempts: readonly Attempt[]; name: string }) {
  const accuracy = trend(attempts, "accuracy", { dayOf: localDay });
  const speed = trend(attempts, "medianMs", { dayOf: localDay });
  return (
    <div className="grid gap-6">
      <TrendChart title={en.analytics.accuracyTrend(name)} data={accuracy.points.map((p) => ({ day: p.day, value: p.value, attempts: p.attempts }))} format={en.analytics.percent} domain={[0, 1]} enough={accuracy.enough} notEnough={en.analytics.notEnoughTrend} />
      <TrendChart title={en.analytics.speedTrend(name)} data={speed.points.map((p) => ({ day: p.day, value: p.value, attempts: p.attempts }))} format={en.analytics.seconds} enough={speed.enough} notEnough={en.analytics.notEnoughTrend} />
    </div>
  );
}

function Heatmap({ attempts, letters }: { attempts: readonly Attempt[]; letters: readonly string[] }) {
  const cells = heatCells(attempts, "pairs");
  const data = new Map<string, HeatDatum>();
  for (const first of letters)
    for (const second of letters) {
      const id = `${first}${second}`;
      const cell = cells.get(id);
      data.set(id, {
        id,
        row: first,
        col: second,
        speedStep: cell?.speedStep,
        band: cell?.accuracyBand,
        tooltip: cell === undefined ? `${id}: —` : en.analytics.pairTooltip(id, cell.attempts, en.analytics.percent(cell.accuracy), en.analytics.seconds(cell.medianMs)),
        tableRow: [id, String(cell?.attempts ?? 0), cell === undefined ? "—" : en.analytics.percent(cell.accuracy), cell === undefined ? "—" : en.analytics.seconds(cell.medianMs)],
      });
    }
  return (
    <HeatGrid
      title={en.analytics.heatmapTitle}
      caption={en.analytics.heatmapCaption}
      rows={letters.map((l) => ({ key: l, label: l }))}
      cols={letters.map((l) => ({ key: l, label: l }))}
      rowLabel={en.analytics.first}
      colLabel={en.analytics.second}
      data={data}
      tableHead={en.analytics.pairHead}
    />
  );
}

function WeakList({ events }: { events: Parameters<typeof weakDeck>[0] }) {
  const reader = useReader();
  const items = useMemo(() => weakDeck(events, new Date()), [events]);
  if (reader === undefined) return null;
  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-6">
      <h2 className="t-heading">{en.analytics.weakTitle}</h2>
      <p className="t-meta text-quiet">{en.analytics.weakCaption}</p>
      {items.length === 0 ? (
        <p className="t-body text-quiet">{en.analytics.weakEmpty}</p>
      ) : (
        <>
          <div>
            <TransitionLink href="/practice/weak/" className="btn btn-strong no-underline">{en.analytics.weakDrill}</TransitionLink>
          </div>
          <ol className="flex flex-col">
            {items.map((item, i) => (
              <li key={`${item.trainer}|${item.caseId}`} className="grid grid-cols-[2rem_1fr] gap-2 border-t border-rule/60 py-2">
                <span className="t-meta text-quiet" style={{ fontVariantNumeric: "tabular-nums" }}>{i + 1}.</span>
                <span className="flex flex-col">
                  <span className="t-body">{itemLabel(reader, item.trainer, item.caseId)}</span>
                  <span className="t-meta text-quiet">
                    {en.analytics.trainers[item.trainer as TrainerKey]} · {en.analytics.weakRow(item.attempts, en.analytics.percent(item.accuracy), en.analytics.seconds(item.medianMs))}
                    {item.reasons.length > 0 ? ` · ${item.reasons.map((r) => en.analytics.reasons[r]).join(", ")}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/**
 * The old app's memo attempts, shown as what they are: whole memos scored letter by letter. They have no
 * per-pair timing or result, so they stay out of every view above (docs/OVERNIGHT.md, "Legacy memo attempts").
 */
function LegacyMemos({ events }: { events: readonly LegacyMemoLike[] }) {
  const summary = useMemo(() => legacyMemoSummary(events), [events]);
  if (summary === undefined) return null;
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-6">
      <h2 className="t-heading">{en.analytics.legacyTitle}</h2>
      <p className="t-body">{en.analytics.legacySummary(summary.attempts, date(summary.first), date(summary.last), summary.correctLetters, summary.totalLetters)}</p>
      <p className="t-meta text-quiet">{en.analytics.legacyCaption}</p>
      <details>
        <summary className="cursor-pointer t-ui">{en.analytics.legacyShow(summary.attempts)}</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full t-meta">
            <thead>
              <tr className="text-left text-quiet">
                {en.analytics.legacyHead.map((h) => (
                  <th key={h} scope="col" className="py-1 pr-4 font-[500]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row, i) => (
                <tr key={`${row.at}-${String(i)}`} className="border-t border-rule">
                  <td className="py-1 pr-4">{date(row.at)}</td>
                  <td className="py-1 pr-4">{row.difficulty}</td>
                  <td className="py-1 pr-4 mono">{en.analytics.legacyLetters(row.correctLetters, row.totalLetters)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
