"use client";

import type { AppEvent } from "@bld/storage";
import { useMemo } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { TransitionLink } from "@/components/transitions/transition-link";
import { cfopData } from "@/content/cfop";
import { cfop } from "@/i18n/cfop";
import { en } from "@/i18n/en";
import { effectiveStatus, F2L_TRAINER, foldStats, LL_TRAINER } from "@/lib/cfop-stats";
import { caseTitle } from "@/lib/cfop-text";

/**
 * CFOP progress (polish brief §51): what the F2L and last-layer trainers have recorded, folded from the same event log as
 * every other trainer (D-083). It adds no second store: learned and learning counts, weakest cases, recognition speed and
 * the split between two-handed and one-handed answers are all read from `drill.attempt` events.
 */
export function CfopProgress({ events }: { events: readonly AppEvent[] }) {
  const { stored } = useSettings();
  const data = cfopData();
  const view = useMemo(() => {
    const ll = foldStats(events, LL_TRAINER);
    const f2l = foldStats(events, F2L_TRAINER);
    const manual = stored?.caseStatus;
    const stages = (["eo", "co", "cp", "ep", "oll", "pll"] as const).map((stage) => {
      const cases = data.sets[stage].cases;
      const statuses = cases.map((c) => effectiveStatus(c.id, ll.get(c.id), manual).value);
      return { stage, total: cases.length, tried: cases.filter((c) => ll.has(c.id)).length, learned: statuses.filter((s) => s === "learned").length, learning: statuses.filter((s) => s === "learning").length };
    });
    const llRows = [...ll.values()];
    const attempts = llRows.reduce((n, r) => n + r.attempts, 0);
    const correct = llRows.reduce((n, r) => n + r.correct, 0);
    const times = llRows.flatMap((r) => (r.recentMs === undefined ? [] : [r.recentMs]));
    const averageMs = times.length === 0 ? undefined : times.reduce((a, b) => a + b, 0) / times.length;
    const weak = (stage: "oll" | "pll") => data.sets[stage].cases
      .flatMap((c) => { const s = ll.get(c.id); return s !== undefined && s.attempts >= 2 && s.accuracy < 0.8 ? [{ title: caseTitle(stage, c), accuracy: s.accuracy }] : []; })
      .sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
    let two = 0; let one = 0;
    for (const e of events) if (e.type === "drill.attempt" && e.trainer === LL_TRAINER) { if (e.detail?.style === "OH") one += 1; else two += 1; }
    const f2lRows = [...f2l.values()];
    const solves = f2lRows.reduce((n, r) => n + r.correct, 0);
    const f2lAttempts = f2lRows.reduce((n, r) => n + r.attempts, 0);
    const level1 = f2lRows.filter((r) => /^f2l_\d\d$/.test(r.caseId));
    const moves = level1.reduce((n, r) => n + r.moves, 0);
    const level1Solves = level1.reduce((n, r) => n + r.correct, 0);
    return { stages, attempts, correct, averageMs, weakOll: weak("oll"), weakPll: weak("pll"), styles: { two, one }, solves, f2lAttempts, cases: level1.length, averageMoves: level1Solves === 0 ? undefined : moves / level1Solves };
  }, [events, stored?.caseStatus, data]);

  if (view.attempts === 0 && view.f2lAttempts === 0) {
    return (
      <section className="flex flex-col gap-3 border-t border-rule pt-6" aria-labelledby="cfop-progress">
        <h2 id="cfop-progress" className="t-heading">{cfop.progress.title}</h2>
        <p className="t-body text-quiet">{cfop.progress.none}</p>
        <TransitionLink className="text-link self-start" href="/practice/last-layer/">{cfop.progress.open}</TransitionLink>
      </section>
    );
  }
  const pct = (n: number, d: number) => (d === 0 ? "–" : `${String(Math.round((n / d) * 100))}%`);
  return (
    <section className="flex flex-col gap-5 border-t border-rule pt-6" aria-labelledby="cfop-progress" data-guide="progress-cfop">
      <header className="flex flex-col gap-1"><h2 id="cfop-progress" className="t-heading">{cfop.progress.title}</h2><p className="t-meta text-quiet">{cfop.progress.intro}</p></header>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="t-subheading">{cfop.progress.f2lTitle}</h3>
          <p className="t-body">{cfop.progress.f2lSolves}: {view.solves} · {cfop.progress.f2lSuccess}: {pct(view.solves, view.f2lAttempts)}</p>
          <p className="t-meta text-quiet">{cfop.f2lPractice.stats.averageMoves}: {view.averageMoves === undefined ? "–" : view.averageMoves.toFixed(1)} · {cfop.progress.casesOf(view.cases, 41)}</p>
          <TransitionLink className="text-link self-start" href="/practice/f2l/">{cfop.sheet.f2lPractice}</TransitionLink>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="t-subheading">{cfop.progress.llTitle}</h3>
          <p className="t-body">{cfop.progress.recognition}: {pct(view.correct, view.attempts)} · {cfop.progress.speed}: {view.averageMs === undefined ? "–" : cfop.trainer.seconds(view.averageMs)}</p>
          <p className="t-meta text-quiet">{cfop.progress.styleSplit(view.styles.two, view.styles.one)}</p>
          <TransitionLink className="text-link self-start" href="/practice/last-layer/">{cfop.progress.open}</TransitionLink>
        </div>
      </div>
      <div className="data-table-wrap">
        <table className="data-table" aria-label={cfop.progress.byStage}>
          <thead><tr><th scope="col">{cfop.progress.byStage}</th><th scope="col">{cfop.status.learned}</th><th scope="col">{cfop.status.learning}</th><th scope="col">{cfop.progress.tried}</th></tr></thead>
          <tbody>{view.stages.map((row) => <tr key={row.stage}><th scope="row">{cfop.progress.stageLabel[row.stage]}</th><td>{cfop.progress.learned(row.learned, row.total)}</td><td>{row.learning}</td><td>{row.tried} / {row.total}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h3 className="t-subheading">{cfop.progress.weakOlls}</h3>{view.weakOll.length === 0 ? <p className="t-meta text-quiet">{en.analytics.empty}</p> : <ul className="ml-5 list-disc t-body">{view.weakOll.map((w) => <li key={w.title}>{w.title} · {Math.round(w.accuracy * 100)}%</li>)}</ul>}</div>
        <div><h3 className="t-subheading">{cfop.progress.weakPlls}</h3>{view.weakPll.length === 0 ? <p className="t-meta text-quiet">{en.analytics.empty}</p> : <ul className="ml-5 list-disc t-body">{view.weakPll.map((w) => <li key={w.title}>{w.title} · {Math.round(w.accuracy * 100)}%</li>)}</ul>}</div>
      </div>
    </section>
  );
}
