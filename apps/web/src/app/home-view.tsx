"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { BookOpenIcon, BrainIcon, TargetIcon } from "@phosphor-icons/react";
import { useSettings } from "@/components/settings/settings-provider";
import { TransitionLink } from "@/components/transitions/transition-link";
import { cfop } from "@/i18n/cfop";
import { en } from "@/i18n/en";
import { loadStorage } from "@/lib/storage-lazy";
import type { Today } from "./home-data";
import { polish } from "@/i18n/polish";

/** The ways in (polish brief §60): three methods and the training centre, each a link into what the site now teaches. */
function PathCards() {
  const paths = [
    { href: "/learn/#track-3bld", title: cfop.hubs.home.bld, body: cfop.hubs.home.bldBlurb },
    { href: "/learn/#track-cfop", title: cfop.hubs.home.cfop, body: cfop.hubs.home.cfopBlurb },
    { href: "/learn/#track-oh", title: cfop.hubs.home.oh, body: cfop.hubs.home.ohBlurb },
    { href: "/practice/", title: cfop.hubs.home.practice, body: cfop.hubs.home.practiceBlurb },
  ];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="home-paths" data-guide="home-paths">
      <div className="flex flex-col gap-1"><h2 id="home-paths" className="t-heading">{cfop.hubs.home.pathsTitle}</h2><p className="t-body text-quiet prose-measure">{cfop.hubs.home.pathsIntro}</p></div>
      <div className="path-grid">{paths.map((path) => <TransitionLink key={path.href} href={path.href} className="path-card"><h3>{path.title}</h3><p className="t-body text-quiet">{path.body}</p></TransitionLink>)}</div>
    </section>
  );
}

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
      <div className="workspace home-launch flex flex-col gap-12">
        <section className="hero-layout">
          <div className="hero-copy" data-guide="home-start"><h1 className="hero-title">{polish.home.title}</h1><p className="t-body max-w-[42ch] text-quiet">{polish.home.intro}</p><div className="flex flex-wrap gap-3"><TransitionLink href="/learn/" className="btn btn-strong">{polish.home.start}</TransitionLink><TransitionLink href="/practice/" className="btn">{polish.home.practice}</TransitionLink></div></div>
          <div className="hero-stage"><HeroCube eager setup="R U R' U'" label={polish.home.cube} /></div>
        </section>
        <PathCards />
        <section className="home-journey" data-guide="home-journey">
          <div className="flex flex-col gap-4"><h2 className="t-heading">{polish.home.journey}</h2><p className="text-quiet t-body">{polish.home.firstIntro}</p><TransitionLink href="/practice/first-solve/" className="btn self-start">{polish.home.first}</TransitionLink><p className="t-meta text-quiet">{polish.home.local}</p></div>
          <div className="home-journey-links flex flex-col">{[{ href: "/learn/", title: polish.home.path, body: polish.home.pathIntro, icon: BookOpenIcon }, { href: "/practice/levels/", title: polish.home.drill, body: polish.home.drillIntro, icon: TargetIcon }, { href: "/practice/memory/", title: polish.home.personal, body: polish.home.personalIntro, icon: BrainIcon }].map((item) => <TransitionLink key={item.href} href={item.href} className="flex items-start gap-5 no-underline"><item.icon size={28} weight="light" className="shrink-0" aria-hidden /><span><span className="t-subheading block mb-1">{item.title}</span><span className="t-ui text-quiet">{item.body}</span></span></TransitionLink>)}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace home-launch flex flex-col gap-10">
      <h1 className="t-title">{en.home.todayTitle}</h1>
      <div className="hero-layout"><div className="hero-copy" data-guide="home-first"><h2 className="t-heading">{polish.home.first}</h2><p className="t-body text-quiet">{polish.home.firstIntro}</p><TransitionLink href="/practice/first-solve/" className="btn btn-strong self-start">{polish.home.first}</TransitionLink></div><div className="hero-stage"><HeroCube eager label={polish.home.cube} /></div></div>
      <div className="home-today" data-guide="home-today">
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
      <PathCards />
      <div className="flex flex-wrap gap-4"><TransitionLink href="/practice/algorithms/">{polish.home.openLibrary}</TransitionLink><TransitionLink href="/practice/memory/">{polish.home.openMemory}</TransitionLink></div>
    </div>
  );
}
