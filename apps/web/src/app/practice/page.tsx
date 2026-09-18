import type { Metadata } from "next";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";
import { polish } from "@/i18n/polish";
import { speffz } from "@/i18n/speffz";
import { BookOpenIcon, TargetIcon, CubeIcon, BrainIcon, WrenchIcon, TableIcon, FilePdfIcon, StepsIcon, CaretRightIcon } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = { title: en.practice.title, description: en.practice.intro, alternates: { canonical: "/practice/" } };

const TRAINERS = [
  { href: "/practice/speffz/", name: speffz.title, blurb: speffz.intro },
  { href: "/practice/trace/", name: en.practice.trace, blurb: en.practice.traceBlurb },
  { href: "/practice/m2op/", name: en.practice.m2op, blurb: en.practice.m2opBlurb },
  { href: "/practice/3style/", name: en.practice.threeStyle, blurb: en.practice.threeStyleBlurb },
  { href: "/practice/4bld/", name: en.practice.fourBld, blurb: en.practice.fourBldBlurb },
  { href: "/practice/pairs/", name: en.practice.pairs, blurb: en.practice.pairsBlurb },
  { href: "/practice/sandbox/", name: en.sandbox.link, blurb: en.sandbox.blurb },
  { href: "/practice/weak/", name: en.weak.title, blurb: en.weak.intro },
  { href: "/practice/difficulty/", name: en.difficulty.link, blurb: en.difficulty.blurb },
] as const;
const TOOLS = [
  { href: "/practice/first-solve/", name: polish.home.first, blurb: polish.home.firstIntro, icon: BookOpenIcon },
  { href: "/practice/levels/", name: polish.practice.levels, blurb: polish.practice.levelsIntro, icon: StepsIcon },
  { href: "/practice/debug/", name: polish.practice.debugger, blurb: polish.practice.debuggerIntro, icon: WrenchIcon },
  { href: "/practice/algorithms/", name: polish.practice.library, blurb: polish.practice.libraryIntro, icon: TableIcon },
  { href: "/practice/memory/", name: polish.practice.memory, blurb: polish.practice.memoryIntro, icon: BrainIcon },
  { href: "/practice/reference/", name: polish.practice.reference, blurb: polish.practice.referenceIntro, icon: FilePdfIcon },
  { href: "/practice/big-cubes/", name: polish.practice.big, blurb: polish.practice.bigIntro, icon: CubeIcon },
];

export default function PracticePage() {
  return (
    <div className="workspace practice-directory flex flex-col gap-10">
      <header className="page-heading"><h1 className="t-title">{polish.practice.title}</h1><p className="t-body">{polish.practice.intro}</p></header>
      <div className="practice-spotlight"><div><BookOpenIcon size={24} weight="light" aria-hidden /><h2 className="t-heading">{polish.home.first}</h2><p className="t-body text-quiet">{polish.home.firstIntro}</p><TransitionLink className="btn btn-strong" href="/practice/first-solve/">{polish.home.first}</TransitionLink></div><div className="practice-spotlight-image" aria-hidden /></div>
      <section className="flex flex-col gap-5"><h2 className="t-heading">{polish.practice.drills}</h2>
      <ul className="tool-grid">
        {TRAINERS.map((t) => (
          <li key={t.href}><TransitionLink href={t.href} className="tool-link"><TargetIcon className="tool-icon" weight="light" aria-hidden /><h3>{t.name}<CaretRightIcon size={18} aria-hidden /></h3><p>{t.blurb}</p></TransitionLink>
          </li>
        ))}
      </ul>
      </section>
      <section className="flex flex-col gap-5"><h2 className="t-heading">{polish.practice.tools}</h2><div className="tool-grid">{TOOLS.map((t) => <TransitionLink href={t.href} key={t.href} className="tool-link"><t.icon className="tool-icon" weight="light" aria-hidden /><h3>{t.name}</h3><p>{t.blurb}</p></TransitionLink>)}</div></section>
    </div>
  );
}
