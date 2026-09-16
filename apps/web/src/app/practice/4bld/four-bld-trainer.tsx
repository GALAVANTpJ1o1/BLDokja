"use client";

import type { SelectionStrategy } from "@bld/cube-engine";
import type { AppEvent } from "@bld/storage";
import { useState, type ReactNode } from "react";
import { Segmented, TrainerShell } from "@/components/trainer/trainer-shell";
import { en } from "@/i18n/en";
import { FOUR_BLD_BUFFERS, useReader4x4, type FourBldPieces, type Reader4x4 } from "@/lib/reader-4x4";
import { readPreference, useEvents, writePreference } from "@/lib/use-events";
import { FOUR_BLD_MODES, isFourBldMode, isShotMode, type FourBldMode } from "@/trainers/four-bld";
import { ShotDrill } from "./shot-drill";
import { TraceDrill } from "./trace-drill";

const MODE_KEY = "bld.4bld.mode";
const HELP_KEY = "bld.4bld.help";
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

export type Strategy = Extract<SelectionStrategy, "coverage" | "weakness" | "uniform" | "spaced">;
export const STRATEGIES: readonly Strategy[] = ["coverage", "weakness", "uniform", "spaced"];
export const isStrategy = (v: unknown): v is Strategy => typeof v === "string" && (STRATEGIES as readonly string[]).includes(v);

/** What both drills get from the trainer: the reader, the event log, and the settings panel to show. */
export interface DrillProps {
  readonly reader: Reader4x4;
  readonly events: readonly AppEvent[] | undefined;
  readonly append: (events: readonly AppEvent[]) => Promise<void>;
  readonly settings: ReactNode;
}

/** The lesson each drill links back to. */
export function lessonFor(mode: FourBldMode): { href: string; title: string } {
  if (mode === "r2" || mode === "r2-special") return { href: "/learn/4x4-r2-wings/", title: en.fourBld.lessons.r2 };
  if (mode === "u2" || mode === "u2-special") return { href: "/learn/4x4-u2-centres/", title: en.fourBld.lessons.u2 };
  return { href: "/learn/4x4-lettering/", title: en.fourBld.lessons.trace };
}

export const traced = (mode: FourBldMode): FourBldPieces | undefined =>
  mode === "trace-xcenters" ? "xcenters" : mode === "trace-wings" ? "wings" : mode === "trace-corners" ? "corners" : undefined;

/**
 * The 4BLD trainer (BRIEF §6, §7): the three traces and the two swap methods' drills, on a 4x4. Buffers
 * and lettering are fixed to the ones the verified datasets are for (reader-4x4.ts).
 */
export function FourBldTrainer() {
  const reader = useReader4x4();
  const { events, append } = useEvents();
  const [mode, setMode] = useState<FourBldMode>(() => readPreference(MODE_KEY, "trace-xcenters", isFourBldMode));
  const [help, setHelp] = useState<boolean>(() => readPreference(HELP_KEY, true, isBoolean));
  const pieces = traced(mode);

  const settings = (
    <>
      <Segmented<FourBldMode> label={en.fourBld.mode} options={FOUR_BLD_MODES} labels={en.fourBld.modes} value={mode} onChange={(v) => { setMode(v); writePreference(MODE_KEY, v); }} />
      {pieces !== undefined ? (
        <label className="flex items-center gap-2 t-ui">
          <input type="checkbox" checked={help} onChange={(e) => { setHelp(e.target.checked); writePreference(HELP_KEY, e.target.checked); }} />
          {en.fourBld.help}
        </label>
      ) : null}
      <p className="t-meta text-quiet">{en.fourBld.buffers(FOUR_BLD_BUFFERS.xcenters, FOUR_BLD_BUFFERS.wings, FOUR_BLD_BUFFERS.corners)}</p>
      <p className="t-meta text-quiet">{en.fourBld.notation}</p>
    </>
  );

  if (reader === undefined) {
    return (
      <TrainerShell title={en.fourBld.title} intro={en.fourBld.intro} lesson={lessonFor(mode)} settings={settings} shortcuts={[]}>
        <p className="t-meta text-quiet">{en.fourBld.loading}</p>
      </TrainerShell>
    );
  }
  // A new drill per mode, so nothing half-answered carries over.
  if (pieces !== undefined) return <TraceDrill key={mode} mode={mode} pieces={pieces} help={help} reader={reader} events={events} append={append} settings={settings} />;
  return isShotMode(mode) ? <ShotDrill key={mode} mode={mode} reader={reader} events={events} append={append} settings={settings} /> : null;
}
