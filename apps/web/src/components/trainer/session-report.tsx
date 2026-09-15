"use client";

import { attemptsOf, sessionSummary, type Suggestion } from "@bld/analytics";
import type { AppEvent } from "@bld/storage";
import { useMemo, useState } from "react";
import { en } from "@/i18n/en";
import { itemLabel } from "@/lib/item-labels";
import type { Reader } from "@/lib/reader";

/**
 * The session summary every trainer shows (BRIEF §8): what improved against each case's history, what
 * slipped, and what to do next, recomputed after every answer. Concrete lines only; nothing when there's
 * nothing to say.
 */
export function SessionReport({ reader, trainer, events }: { reader: Reader; trainer: string; events: readonly AppEvent[] | undefined }) {
  // The session starts when the trainer opens, rounded down to the second: logged times are whole
  // seconds, so an answer in the opening second would otherwise look older than the session.
  const [since] = useState(() => Math.floor(new Date().getTime() / 1000) * 1000);
  const summary = useMemo(() => sessionSummary(attemptsOf(events ?? []), trainer, since), [events, trainer, since]);
  const label = (caseId: string) => itemLabel(reader, trainer, caseId);
  const seconds = (ms: number) => en.analytics.seconds(ms);
  const percent = en.analytics.percent;

  const suggestion = (s: Suggestion): string => {
    switch (s.kind) {
      case "repeat-misses":
        return en.session.repeatMisses(s.caseIds.map(label).join("; "));
      case "slow-lookup":
        return en.session.slowLookup(en.analytics.kinds[s.lookup], seconds(s.medianMs), seconds(s.normalMs));
      case "speed-up":
        return en.session.speedUp(s.caseIds.map(label).join("; "));
      case "keep-going":
        return en.session.keepGoing;
    }
  };

  return (
    <section className="flex flex-col gap-2 border-t border-rule pt-4" aria-live="polite">
      <h2 className="t-subheading">{en.session.title}</h2>
      {summary.attempts === 0 ? (
        <p className="t-meta text-quiet">{en.session.empty}</p>
      ) : (
        <>
          <p className="t-body">{en.session.stats(summary.attempts, summary.correct, summary.medianMs === undefined ? "—" : seconds(summary.medianMs))}</p>
          {summary.firstTimes > 0 ? <p className="t-meta text-quiet">{en.session.firstTimes(summary.firstTimes)}</p> : null}
          {(["improved", "regressed"] as const).map((kind) =>
            summary[kind].length === 0 ? null : (
              <div key={kind} className="flex flex-col gap-1">
                <h3 className="t-meta font-[650]">{kind === "improved" ? en.session.improved : en.session.regressed}</h3>
                <ul className="ml-5 list-disc t-meta">
                  {summary[kind].slice(0, 5).map((c) => (
                    <li key={c.caseId}>{en.session.change(label(c.caseId), percent(c.before.accuracy), percent(c.now.accuracy), seconds(c.before.medianMs), seconds(c.now.medianMs))}</li>
                  ))}
                </ul>
              </div>
            ),
          )}
          <h3 className="t-meta font-[650]">{en.session.next}</h3>
          <ul className="ml-5 list-disc t-body">
            {summary.next.map((s) => (
              <li key={s.kind}>{suggestion(s)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
