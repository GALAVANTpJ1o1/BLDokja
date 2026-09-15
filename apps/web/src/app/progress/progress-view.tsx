"use client";

import { attemptsOf, heatCells, LOOKUP_KINDS, MIN_SAMPLES, traceDiagnostics, trend, type Attempt } from "@bld/analytics";
import { useMemo, useState } from "react";
import { BarRows, HeatGrid, TrendChart, type HeatDatum } from "@/components/charts/charts";
import { Segmented } from "@/components/trainer/trainer-shell";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";
import { itemLabel } from "@/lib/item-labels";
import { threeStyleForReader, useMethodData } from "@/lib/methods";
import { useReader } from "@/lib/reader";
import { useEvents } from "@/lib/use-events";
import { weakDeck } from "@/lib/weak";
import { gridStickers } from "@/trainers/three-style";
import { libraryLetters } from "@/trainers/pairs";

type Range = "30" | "90" | "all";
type TrainerKey = "trace" | "pairs" | "m2op" | "3style";
const TRAINERS: readonly TrainerKey[] = ["trace", "pairs", "m2op", "3style"];
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
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Segmented<Range> label={en.analytics.range} options={["30", "90", "all"]} labels={en.analytics.ranges} value={range} onChange={setRange} />
        <p className="t-body">
          {en.analytics.attempts(attempts.length)} · {en.analytics.days(days)}
          {attempts.length > 0 ? ` · ${en.analytics.accuracy(Math.round((correct / attempts.length) * 100))}` : ""}
        </p>
        {all.length === 0 ? <p className="t-body text-quiet">{en.analytics.empty}</p> : null}
      </div>

      <Diagnostics attempts={attempts} />

      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <h2 className="t-heading">{en.analytics.trendsTitle}</h2>
        <p className="t-meta text-quiet">{en.analytics.trendsCaption}</p>
        <Segmented<TrainerKey> label={en.analytics.trainer} options={TRAINERS} labels={en.analytics.trainers} value={trainer} onChange={setTrainer} />
        <Trends attempts={attempts.filter((a) => a.trainer === trainer)} name={en.analytics.trainers[trainer]} />
      </section>

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

      <section className="flex flex-col gap-2 border-t border-rule pt-6">
        <h2 className="t-heading">{en.analytics.dataTitle}</h2>
        <p className="t-body text-quiet">{en.analytics.dataText}</p>
        <TransitionLink href="/settings/" className="t-body">{en.analytics.dataLink}</TransitionLink>
      </section>
    </div>
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
