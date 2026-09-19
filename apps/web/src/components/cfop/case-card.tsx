"use client";

import type { CuratedCase, CuratedStage, ExecutionStyle, F2LCuratedCase } from "@bld/cube-engine/cfop-data";
import { CaretDownIcon, CaretUpIcon, CopyIcon } from "@phosphor-icons/react";
import { lazy, Suspense, useId, useState } from "react";
import { useCubeProfile } from "@/components/cube/profile-scope";
import { TransitionLink } from "@/components/transitions/transition-link";
import { cfop } from "@/i18n/cfop";
import { en } from "@/i18n/en";
import { caseClue, caseHold, caseTitle, colourLetters, f2lClue, f2lTitle, shownAlg } from "@/lib/cfop-text";
import { caseView, decodeTop, NO_FEATURES } from "@/lib/cfop-views";
import type { CaseStatus, EffectiveStatus } from "@/lib/cfop-stats";
import { IsoCube, RecognitionDiagram } from "./diagrams";

const CardCube = lazy(() => import("./card-cube").then((m) => ({ default: m.CardCube })));

/**
 * The one card every algorithm set uses (polish brief §10-11, §83). Order of reading: the picture, the name, what to look
 * for, how to hold it, the algorithm, playback, then everything secondary. F2L, 2-look and full OLL and PLL share this
 * component; the set only changes which diagram and which words it gets.
 */
export type CardItem =
  | { readonly kind: "ll"; readonly stage: CuratedStage; readonly kase: CuratedCase }
  | { readonly kind: "f2l"; readonly kase: F2LCuratedCase };

export interface CaseCardProps {
  readonly item: CardItem;
  readonly style: ExecutionStyle;
  readonly tempo: number;
  readonly status?: EffectiveStatus;
  readonly onStatus?: (caseId: string, status: CaseStatus | null) => void;
  readonly practiceHref?: string;
  /** Heading level so a card sits correctly under whatever heading holds it. */
  readonly level?: 3 | 4;
}

const DIAGRAM_MODE = { eo: "OLL_EDGE_RECOGNITION", co: "OLL_FULL_RECOGNITION", oll: "OLL_FULL_RECOGNITION", cp: "PLL_RECOGNITION", ep: "PLL_RECOGNITION", pll: "PLL_RECOGNITION" } as const;

export function CaseCard({ item, style, tempo, status, onStatus, practiceHref, level = 3 }: CaseCardProps) {
  const [open, setOpen] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [copied, setCopied] = useState(false);
  const headingId = useId();
  const profile = useCubeProfile();
  const view = caseView(item.kase.id);
  const Heading = `h${level}` as const;
  const isF2L = item.kind === "f2l";
  const title = item.kind === "ll" ? caseTitle(item.stage, item.kase) : f2lTitle(item.kase);
  const clue = item.kind === "ll" ? caseClue(item.stage, item.kase) : f2lClue(item.kase);
  const hold = item.kind === "ll" ? caseHold(item.stage, item.kase) : cfop.f2lHold;
  const ll = item.kind === "ll" ? shownAlg(item.kase, style) : undefined;
  const f2lAlg = item.kind === "f2l" ? (mirror && view?.mirror !== undefined ? view.mirror.alg : item.kase.algs["2H"].alg) : undefined;
  const alg = ll?.alg ?? f2lAlg ?? "";
  const moves = ll?.moves ?? (item.kind === "f2l" ? item.kase.algs["2H"].moves : 0);
  const setup = item.kind === "f2l" && mirror && view?.mirror !== undefined ? view.mirror.setup : (view?.setup ?? "");
  const playable = ll !== undefined ? ll.executable : alg;
  const family = item.kind === "ll" ? (cfop.groups[item.kase.group] ?? item.kase.group) : (cfop.f2lFamilies[item.kase.family]?.title ?? item.kase.family);
  const shownView = view?.top === undefined ? undefined : decodeTop(view.top);
  const features = view?.features ?? NO_FEATURES;
  const label = cfop.card.diagram(title, clue);
  const diagram = item.kind === "f2l"
    ? (() => { const iso = mirror && view?.mirror !== undefined ? view.mirror.iso : view?.iso; return iso === undefined ? null : <IsoCube iso={iso} label={label} className="case-card-svg" />; })()
    : shownView === undefined ? null : <RecognitionDiagram diagram={shownView} mode={DIAGRAM_MODE[item.stage]} label={label} letters={colourLetters(profile)} bars={features.bars} headlights={features.headlights} className="case-card-svg" />;
  const copy = () => {
    void navigator.clipboard.writeText(alg).then(() => { setCopied(true); setTimeout(() => { setCopied(false); }, 1600); }).catch(() => undefined);
  };
  const renderMode = item.kind === "f2l" ? "F2L_SINGLE_PAIR" : item.stage === "eo" ? "OLL_EDGE_RECOGNITION" : item.stage === "pll" || item.stage === "cp" || item.stage === "ep" ? "PLL_RECOGNITION" : "OLL_FULL_RECOGNITION";
  const statusValue = status?.manual === true ? status.value : "auto";
  return (
    <article className="case-card" aria-labelledby={headingId} data-case-id={item.kase.id} data-status={status?.value} data-open={open}>
      <div className="case-card-diagram" data-guide="case-diagram">{diagram}</div>
      <div className="case-card-body">
        <header className="case-card-head">
          <Heading id={headingId} className="case-card-title">{title}</Heading>
          <span className="case-card-family t-meta text-quiet">{family}</span>
        </header>
        <p className="case-card-line"><span className="case-card-key">{cfop.card.recognise}</span> {clue}</p>
        <p className="case-card-line"><span className="case-card-key">{cfop.card.hold}</span> {hold}</p>
        <div className="case-card-alg" data-guide="case-alg">
          <code className="t-notation" translate="no">{alg}</code>
          <span className="t-meta text-quiet case-card-moves">{cfop.card.moves(moves)}</span>
        </div>
        {ll !== undefined && (ll.preAuf !== "" || ll.postAuf !== "" || ll.rotation !== "") ? (
          <ul className="case-card-notes t-meta text-quiet">
            {ll.preAuf !== "" ? <li>{cfop.card.aufBefore(ll.preAuf)}</li> : null}
            {ll.postAuf !== "" ? <li>{cfop.card.aufAfter(ll.postAuf)}</li> : null}
            {ll.rotation !== "" ? <li>{cfop.card.reorient(ll.rotation)}</li> : null}
          </ul>
        ) : null}
        {ll?.fallback === true ? <p className="t-meta text-quiet case-card-note">{cfop.card.ohMissing}</p> : null}
        {item.kind === "f2l" ? <p className="t-meta text-quiet case-card-note">{cfop.card.sourceSearch}</p> : null}
        <div className="control-row case-card-actions">
          <button type="button" className="btn btn-strong" aria-expanded={open} onClick={() => { setOpen(!open); }}>
            {open ? <CaretUpIcon size={16} aria-hidden /> : <CaretDownIcon size={16} aria-hidden />}{open ? cfop.card.hide : cfop.card.watch}
          </button>
          <button type="button" className="btn" onClick={copy}><CopyIcon size={16} aria-hidden />{copied ? cfop.card.copied : cfop.card.copy}</button>
          {isF2L && view?.mirror !== undefined ? <button type="button" className="btn" aria-pressed={mirror} onClick={() => { setMirror(!mirror); }}>{cfop.card.mirror}</button> : null}
          {practiceHref !== undefined ? <TransitionLink className="btn" href={practiceHref}>{cfop.card.practise}</TransitionLink> : null}
        </div>
        {onStatus !== undefined && status !== undefined ? (
          <label className="case-card-status t-meta">
            <span>{cfop.status.label}</span>
            <select className="field" value={statusValue} onChange={(event) => { onStatus(item.kase.id, event.target.value === "auto" ? null : event.target.value as CaseStatus); }}>
              <option value="auto">{cfop.status.judged(cfop.status[status.inferred])}</option>
              <option value="unlearned">{cfop.status.setBy(cfop.status.unlearned)}</option>
              <option value="learning">{cfop.status.setBy(cfop.status.learning)}</option>
              <option value="learned">{cfop.status.setBy(cfop.status.learned)}</option>
            </select>
          </label>
        ) : null}
      </div>
      <div className="case-card-cube" data-open={open}>
        <div className="case-card-cube-inner">
          {open ? <Suspense fallback={<p className="t-meta text-quiet" role="status">{en.cube.loading}</p>}><CardCube setup={setup} alg={playable} mode={renderMode} label={cfop.card.label(title)} tempo={tempo} /></Suspense> : null}
        </div>
      </div>
    </article>
  );
}
