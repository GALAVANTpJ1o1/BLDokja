"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";
import { loadStorage } from "@/lib/storage-lazy";
import type { Today } from "./home-data";

/**
 * Home adapts (your 2026-09-15 answer): a new visitor sees the way into the learning path; once any
 * lesson or drill has been started, home shows today's work.
 */
export function HomeView() {
  const [started, setStarted] = useState<boolean | undefined>(undefined);
  const [today, setToday] = useState<Today | undefined>(undefined);
  const { stored } = useSettings();

  useEffect(() => {
    const life = { cancelled: false };
    // Read through a function: the cleanup can flip it while this effect awaits.
    const alive = () => !life.cancelled;
    void (async () => {
      try {
        const [storage, data] = await Promise.all([loadStorage(), import("./home-data")]);
        const [events, pairs] = await Promise.all([storage.events(), storage.letterPairs()]);
        if (!alive()) return;
        setStarted(events.some((e) => e.type !== "legacy.memoAttempt"));
        const computed = await data.today(events, pairs, stored);
        if (alive()) setToday(computed);
      } catch {
        if (alive()) setStarted(false);
      }
    })();
    return () => {
      life.cancelled = true;
    };
  }, [stored]);

  const pairsDue = today?.pairsDue ?? 0;

  // Until storage answers, the page shows what it is. A plain "Loading" line would leave the largest text
  // on the page waiting for IndexedDB, and this keeps the same shape as both states below.
  if (started === undefined) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 className="t-title">{en.site.name}</h1>
        <p className="t-body prose-measure">{en.site.tagline}</p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 className="t-title">{en.home.newTitle}</h1>
        <p className="t-body prose-measure">{en.home.newIntro}</p>
        <div>
          <TransitionLink href="/learn/" className="btn btn-strong no-underline">
            {en.home.startPath}
          </TransitionLink>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="t-title">{en.home.todayTitle}</h1>
      <section className="flex flex-col gap-2 border-t border-rule pt-4">
        <h2 className="t-heading">{en.home.nextLesson}</h2>
        <TransitionLink href="/learn/" className="t-body">{en.home.continueLesson}</TransitionLink>
      </section>
      <section className="flex flex-col gap-2 border-t border-rule pt-4">
        <h2 className="t-heading">{en.home.reviewsDue}</h2>
        {pairsDue === 0 ? (
          <p className="t-body text-quiet">{en.home.reviewsNone}</p>
        ) : (
          <>
            <p className="t-body">{en.pairs.due(pairsDue)}</p>
            <TransitionLink href="/practice/pairs/" className="t-body">{en.home.reviewsLink}</TransitionLink>
          </>
        )}
      </section>
      <section className="flex flex-col gap-2 border-t border-rule pt-4">
        <h2 className="t-heading">{en.home.weakTitle}</h2>
        {today === undefined || today.weakCount === 0 ? (
          <p className="t-body text-quiet">{en.home.weakEmpty}</p>
        ) : (
          <>
            <ul className="ml-5 list-disc t-body">
              {today.weak.map((w) => (
                <li key={w.key}>{w.label}</li>
              ))}
            </ul>
            <TransitionLink href="/practice/weak/" className="t-body">{en.home.weakDrill(today.weakCount)}</TransitionLink>
          </>
        )}
        <TransitionLink href="/practice/" className="t-body">{en.home.practiceLink}</TransitionLink>
      </section>
    </div>
  );
}
