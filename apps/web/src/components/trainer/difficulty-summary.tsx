"use client";

import type { Difficulty } from "@bld/storage";
import { useSettings } from "@/components/settings/settings-provider";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";

/** The difficulty settings in a line of plain words, for any trainer that reads them. */
export function describeDifficulty(difficulty: Difficulty | undefined, uses: { readonly scrambles?: boolean; readonly subsets?: boolean; readonly time?: boolean; readonly relook?: boolean; readonly seed?: boolean }): string[] {
  const d = en.difficulty;
  const parts: string[] = [];
  if (uses.scrambles === true) {
    if (difficulty?.pieces !== undefined && difficulty.pieces !== "both") parts.push(d.pieceOptions[difficulty.pieces]);
    for (const pieces of ["edges", "corners"] as const) {
      const c = difficulty?.constraints?.[pieces];
      if (c === undefined || difficulty?.pieces === (pieces === "edges" ? "corners" : "edges")) continue;
      const bits: string[] = [];
      if (c.targets !== undefined && (c.targets.min !== undefined || c.targets.max !== undefined)) bits.push(d.rangeText(d.targets.toLowerCase(), c.targets.min, c.targets.max));
      if (c.cycleBreaks !== undefined && (c.cycleBreaks.min !== undefined || c.cycleBreaks.max !== undefined)) bits.push(d.rangeText(d.breaks.toLowerCase(), c.cycleBreaks.min, c.cycleBreaks.max));
      if (c.misoriented?.min !== undefined) bits.push(d.misorientedText(pieces, true));
      else if (c.misoriented?.max === 0) bits.push(d.misorientedText(pieces, false));
      if (c.parity !== undefined && pieces === "edges") bits.push(d.parityText(c.parity));
      if (bits.length > 0) parts.push(d.constraintsLine(en.scheme.pieceTypes[pieces], bits.join(", ")));
    }
  }
  if (uses.subsets === true && Object.values(difficulty?.cases ?? {}).some((ids) => ids.length > 0)) parts.push(d.subsetText);
  if (uses.time === true && difficulty?.time !== undefined && difficulty.time.mode !== "none") parts.push(d.timeText(difficulty.time.mode, difficulty.time.seconds));
  if (uses.relook === true && difficulty?.relook === false) parts.push(d.relookText);
  if (uses.seed === true && difficulty?.seed !== undefined) parts.push(d.seedText(difficulty.seed));
  return parts;
}

export function DifficultySummary(uses: Parameters<typeof describeDifficulty>[1]) {
  const { stored } = useSettings();
  const parts = describeDifficulty(stored?.difficulty, uses);
  return (
    <p className="t-meta">
      <span className="text-quiet">{en.difficulty.summary}: </span>
      {parts.length === 0 ? en.difficulty.summaryNone : parts.join(" · ")} · <TransitionLink href="/practice/difficulty/">{en.difficulty.summaryEdit}</TransitionLink>
    </p>
  );
}
