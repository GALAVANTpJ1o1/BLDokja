"use client";

import type { CuratedCase, CuratedStage, F2LCuratedCase } from "@bld/cube-engine/cfop-data";
import { useMemo, useState } from "react";
import { TransitionLink } from "@/components/transitions/transition-link";
import { cfopData, SHEET_STAGES, type ReferenceSheet } from "@/content/cfop";
import { cfop } from "@/i18n/cfop";
import { F2L_TRAINER, LL_TRAINER, type CaseStatus } from "@/lib/cfop-stats";
import { f2lSearchText, matchesSearch, searchText } from "@/lib/cfop-text";
import { CaseCard } from "./case-card";
import { useCaseProgress, useExecutionStyle } from "./use-cfop";

/**
 * A whole algorithm set as one continuous page (polish brief §37): heading, then card after card, grouped by what the
 * cases have in common. There is no scrolling table and no selected-row panel; search and filters only thin the page out.
 */
const TEMPOS = [{ id: "slow", value: 0.6 }, { id: "normal", value: 1 }, { id: "fast", value: 1.5 }] as const;

const PLL_GROUP_ORDER = ["Edges Only", "Adjacent Corner Swap", "Diagonal Corner Swap"];
const F2L_FAMILY_ORDER = ["both-slot", "corner-top-edge-slot", "corner-slot-edge-top", "both-top"] as const;

interface Section {
  readonly id: string;
  readonly title: string;
  readonly blurb?: string;
  readonly cards: readonly (({ kind: "ll"; stage: CuratedStage; kase: CuratedCase } | { kind: "f2l"; kase: F2LCuratedCase }) & { text: string })[];
}

function sectionsFor(sheet: ReferenceSheet): Section[] {
  const data = cfopData();
  if (sheet === "f2l") {
    return F2L_FAMILY_ORDER.map((family) => ({
      id: family, title: cfop.f2lFamilies[family]?.title ?? family, blurb: cfop.f2lFamilies[family]?.blurb,
      cards: data.f2l.cases.filter((c) => c.family === family).map((kase) => ({ kind: "f2l" as const, kase, text: f2lSearchText(kase) })),
    }));
  }
  const stages = SHEET_STAGES[sheet];
  const out: Section[] = [];
  for (const stage of stages) {
    const set = data.sets[stage];
    if (sheet === "2look-oll" || sheet === "2look-pll") {
      out.push({ id: stage, title: cfop.sheet.sections[stage] ?? stage, cards: set.cases.map((kase) => ({ kind: "ll" as const, stage, kase, text: searchText(stage, kase) })) });
      continue;
    }
    const groups = [...new Set(set.cases.map((c) => c.group))];
    if (sheet === "pll") groups.sort((a, b) => PLL_GROUP_ORDER.indexOf(a) - PLL_GROUP_ORDER.indexOf(b));
    for (const group of groups) {
      out.push({ id: `${stage}-${group}`.replace(/\s+/g, "-").toLowerCase(), title: cfop.groups[group] ?? group, cards: set.cases.filter((c) => c.group === group).map((kase) => ({ kind: "ll" as const, stage, kase, text: searchText(stage, kase) })) });
    }
  }
  return out;
}

export function CaseReference({ sheet }: { sheet: ReferenceSheet }) {
  const [style, setStyle] = useExecutionStyle();
  const progress = useCaseProgress(sheet === "f2l" ? F2L_TRAINER : LL_TRAINER);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | CaseStatus>("all");
  const [tempo, setTempo] = useState(1);
  const sections = useMemo(() => sectionsFor(sheet), [sheet]);
  const total = sections.reduce((n, s) => n + s.cards.length, 0);
  const visible = sections
    .map((section) => ({ ...section, cards: section.cards.filter((card) => matchesSearch(card.text, query) && (filter === "all" || progress.statusOf(card.kase.id).value === filter)) }))
    .filter((section) => section.cards.length > 0);
  const shown = visible.reduce((n, s) => n + s.cards.length, 0);
  const practiceHref = sheet === "f2l" ? "/practice/f2l/" : `/practice/last-layer/?mode=${sheet === "2look-oll" ? "2look-oll" : sheet === "2look-pll" ? "2look-pll" : sheet === "oll" ? "1look-oll" : "1look-pll"}`;
  return (
    <div className="case-reference flex flex-col gap-8">
      <div className="case-reference-tools" data-guide="reference-tools">
        <label className="t-ui flex flex-col gap-2 case-reference-search" data-guide="reference-search">
          {cfop.sheet.search}
          <span className="search-field">
            <input type="search" className="field" value={query} placeholder={cfop.sheet.searchHint} onChange={(event) => { setQuery(event.target.value); }} autoComplete="off" spellCheck={false} />
            {query !== "" ? <button type="button" className="btn search-clear" onClick={() => { setQuery(""); }}>{cfop.sheet.clear}</button> : null}
          </span>
        </label>
        <div className="control-row">
          <div className="control-row" role="group" aria-label={cfop.style.label} data-guide="reference-style">
            <span className="t-meta text-quiet">{cfop.style.label}</span>
            {sheet === "f2l" ? <span className="t-meta text-quiet">{cfop.style["2H"]}</span> : (["2H", "OH"] as const).map((s) => <button key={s} type="button" className="btn" aria-pressed={style === s} onClick={() => { setStyle(s); }}>{cfop.style[s]}</button>)}
          </div>
          <label className="t-ui flex items-center gap-2">{cfop.card.speed}
            <select className="field" value={tempo} onChange={(event) => { setTempo(Number(event.target.value)); }}>
              {TEMPOS.map((t) => <option key={t.id} value={t.value}>{cfop.card.speeds[t.id]}</option>)}
            </select>
          </label>
          <label className="t-ui flex items-center gap-2">{cfop.sheet.filter}
            <select className="field" value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); }}>
              <option value="all">{cfop.sheet.filters.all}</option>
              <option value="unlearned">{cfop.sheet.filters.unlearned}</option>
              <option value="learning">{cfop.sheet.filters.learning}</option>
              <option value="learned">{cfop.sheet.filters.learned}</option>
            </select>
          </label>
        </div>
        <p className="t-meta text-quiet" role="status">{cfop.sheet.results(shown, total)}{sheet !== "f2l" ? ` · ${cfop.style.note}` : ""}</p>
        <nav className="case-reference-jump" aria-label={cfop.sheet.jump}>
          {visible.map((section) => <a key={section.id} className="btn" href={`#${section.id}`}>{section.title}</a>)}
        </nav>
      </div>
      {visible.length === 0 ? <p className="t-body status-line">{cfop.sheet.none}</p> : null}
      {visible.map((section) => (
        <section key={section.id} id={section.id} className="case-section flex flex-col gap-4" aria-labelledby={`${section.id}-h`}>
          <header className="flex flex-col gap-1">
            <h2 id={`${section.id}-h`} className="t-heading">{section.title}</h2>
            {section.blurb !== undefined ? <p className="t-body text-quiet prose-measure">{section.blurb}</p> : null}
            <p className="t-meta text-quiet">{cfop.sheet.count(section.cards.length)}</p>
          </header>
          <div className="case-grid" data-guide="reference-grid">
            {section.cards.map((card) => (
              <CaseCard key={card.kase.id} item={card} style={style} tempo={tempo} status={progress.statusOf(card.kase.id)} onStatus={(id, status) => { progress.setStatus(id, status); }} practiceHref={practiceHref} />
            ))}
          </div>
        </section>
      ))}
      <p className="t-meta text-quiet case-reference-foot">{cfop.status.autoNote}</p>
      <TransitionLink className="btn self-start" href="/reference/">{cfop.sheet.back}</TransitionLink>
    </div>
  );
}
