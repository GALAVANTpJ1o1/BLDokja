"use client";

import { dueCases, reviewsByCase, scheduleAll } from "@bld/srs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { en } from "@/i18n/en";
import { getStorage } from "@/lib/storage-client";
import { mainImage, PAIRS_TRAINER } from "@/trainers/pairs";

/**
 * Home adapts (your 2026-09-15 answer): a new visitor sees the way into the learning path; once any
 * lesson or drill has been started, home shows today's work.
 */
export function HomeView() {
  const [started, setStarted] = useState<boolean | undefined>(undefined);
  const [pairsDue, setPairsDue] = useState(0);

  useEffect(() => {
    const storage = getStorage();
    void Promise.all([storage.events(), storage.letterPairs()])
      .then(([events, pairs]) => {
        setStarted(events.some((e) => e.type !== "legacy.memoAttempt"));
        // The same queue as the library's Review view: due cards for pairs that have an image.
        const ids = pairs.filter((p) => mainImage(p) !== undefined).map((p) => p.id);
        const now = new Date();
        setPairsDue(dueCases(scheduleAll(ids, reviewsByCase(events, PAIRS_TRAINER), now), now).length);
      })
      .catch(() => { setStarted(false); });
  }, []);

  if (started === undefined) return <p className="t-meta text-quiet">{en.common.loading}</p>;

  if (!started) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 className="t-title">{en.home.newTitle}</h1>
        <p className="t-body prose-measure">{en.home.newIntro}</p>
        <div>
          <Link href="/learn/" className="btn btn-strong no-underline">
            {en.home.startPath}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="t-title">{en.home.todayTitle}</h1>
      <section className="flex flex-col gap-2 border-t border-rule pt-4">
        <h2 className="t-heading">{en.home.nextLesson}</h2>
        <Link href="/learn/" className="t-body">{en.home.continueLesson}</Link>
      </section>
      <section className="flex flex-col gap-2 border-t border-rule pt-4">
        <h2 className="t-heading">{en.home.reviewsDue}</h2>
        {pairsDue === 0 ? (
          <p className="t-body text-quiet">{en.home.reviewsNone}</p>
        ) : (
          <>
            <p className="t-body">{en.pairs.due(pairsDue)}</p>
            <Link href="/practice/pairs/" className="t-body">{en.home.reviewsLink}</Link>
          </>
        )}
      </section>
      <section className="flex flex-col gap-2 border-t border-rule pt-4">
        <h2 className="t-heading">{en.home.weakTitle}</h2>
        <p className="t-body text-quiet">{en.home.weakEmpty}</p>
        <Link href="/practice/" className="t-body">{en.home.practiceLink}</Link>
      </section>
    </div>
  );
}
