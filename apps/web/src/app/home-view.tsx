"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { BookOpenIcon, BrainIcon, TargetIcon } from "@phosphor-icons/react";
import { useSettings } from "@/components/settings/settings-provider";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";
import { loadStorage } from "@/lib/storage-lazy";
import type { Today } from "./home-data";
import { polish } from "@/i18n/polish";

const HeroCube = dynamic(() => import("@/components/cube/cube").then((m) => m.Cube), { ssr: false });

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
  if (!started) {
    return (
      <div className="workspace home-launch flex flex-col gap-16">
        <section className="hero-layout">
          <div className="hero-copy"><h1 className="hero-title">{polish.home.title}</h1><p className="t-body max-w-[42ch] text-quiet">{polish.home.intro}</p><div className="flex flex-wrap gap-3"><TransitionLink href="/learn/" className="btn btn-strong">{polish.home.start}</TransitionLink><TransitionLink href="/practice/" className="btn">{polish.home.practice}</TransitionLink></div></div>
          <div className="hero-stage"><HeroCube eager setup="R U R' U'" label={polish.home.cube} /></div>
        </section>
        <section className="grid gap-8 md:grid-cols-[1fr_1.4fr]">
          <div className="flex flex-col gap-4"><h2 className="t-heading">{polish.home.journey}</h2><p className="text-quiet t-body">{polish.home.firstIntro}</p><TransitionLink href="/practice/first-solve/" className="btn self-start">{polish.home.first}</TransitionLink><p className="t-meta text-quiet">{polish.home.local}</p></div>
          <div className="flex flex-col gap-6">{[{ href: "/learn/", title: polish.home.path, body: polish.home.pathIntro, icon: BookOpenIcon }, { href: "/practice/levels/", title: polish.home.drill, body: polish.home.drillIntro, icon: TargetIcon }, { href: "/practice/memory/", title: polish.home.personal, body: polish.home.personalIntro, icon: BrainIcon }].map((item) => <TransitionLink key={item.href} href={item.href} className="flex items-start gap-5 no-underline"><item.icon size={28} weight="light" className="shrink-0" aria-hidden /><span><span className="t-subheading block mb-1">{item.title}</span><span className="t-ui text-quiet">{item.body}</span></span></TransitionLink>)}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace home-launch flex flex-col gap-10">
      <h1 className="t-title">{en.home.todayTitle}</h1>
      <div className="hero-layout"><div className="hero-copy"><h2 className="t-heading">{polish.home.first}</h2><p className="t-body text-quiet">{polish.home.firstIntro}</p><TransitionLink href="/practice/first-solve/" className="btn btn-strong self-start">{polish.home.first}</TransitionLink></div><div className="hero-stage"><HeroCube eager label={polish.home.cube} /></div></div>
      <div className="tool-grid">
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
      <div className="flex flex-wrap gap-4"><TransitionLink href="/practice/algorithms/">{polish.home.openLibrary}</TransitionLink><TransitionLink href="/practice/memory/">{polish.home.openMemory}</TransitionLink></div>
    </div>
  );
}
