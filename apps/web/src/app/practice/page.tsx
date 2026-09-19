import type { Metadata } from "next";
import { TransitionLink } from "@/components/transitions/transition-link";
import { cfop } from "@/i18n/cfop";
import { en } from "@/i18n/en";
import { polish } from "@/i18n/polish";
import { speffz } from "@/i18n/speffz";
import { workspaces } from "@/i18n/workspaces";
import { BookOpenIcon, BrainIcon, CubeIcon, FilePdfIcon, GridFourIcon, StackIcon, StepsIcon, TableIcon, TargetIcon, WrenchIcon, CaretRightIcon } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = { title: en.practice.title, description: en.practice.intro, alternates: { canonical: "/practice/" } };

interface Tool { readonly href: string; readonly name: string; readonly blurb: string; readonly icon?: typeof TargetIcon; readonly inProgress?: boolean }

/**
 * The practice hub, organised by skill (polish brief §62): F2L, last layer, blindfolded, memory, reference. Every entry keeps its
 * route; only the grouping and the order are new.
 */
const GROUPS: readonly { readonly id: string; readonly title: string; readonly blurb: string; readonly tools: readonly Tool[] }[] = [
  {
    id: "f2l", title: cfop.hubs.practice.groups.f2l.title, blurb: cfop.hubs.practice.groups.f2l.blurb,
    tools: [
      { href: "/practice/f2l/", name: cfop.hubs.practice.f2l, blurb: cfop.hubs.practice.f2lBlurb, icon: StackIcon },
      { href: "/reference/f2l/", name: cfop.sheet.title.f2l, blurb: cfop.sheet.intro.f2l, icon: GridFourIcon },
    ],
  },
  {
    id: "last-layer", title: cfop.hubs.practice.groups.lastLayer.title, blurb: cfop.hubs.practice.groups.lastLayer.blurb,
    tools: [
      { href: "/practice/last-layer/", name: cfop.hubs.practice.lastLayer, blurb: cfop.hubs.practice.lastLayerBlurb, icon: TargetIcon },
      { href: "/reference/", name: cfop.hubs.practice.sheets, blurb: cfop.hubs.practice.sheetsBlurb, icon: GridFourIcon },
    ],
  },
  {
    id: "blind", title: cfop.hubs.practice.groups.blind.title, blurb: cfop.hubs.practice.groups.blind.blurb,
    tools: [
      { href: "/practice/first-solve/", name: polish.home.first, blurb: polish.home.firstIntro, icon: BookOpenIcon },
      { href: "/practice/speffz/", name: speffz.title, blurb: speffz.intro },
      { href: "/practice/trace/", name: en.practice.trace, blurb: en.practice.traceBlurb },
      { href: "/practice/m2op/", name: en.practice.m2op, blurb: en.practice.m2opBlurb },
      { href: "/practice/3style/", name: en.practice.threeStyle, blurb: en.practice.threeStyleBlurb },
      { href: "/practice/4bld/", name: en.practice.fourBld, blurb: en.practice.fourBldBlurb },
      { href: "/practice/levels/", name: polish.practice.levels, blurb: polish.practice.levelsIntro, icon: StepsIcon },
      { href: "/practice/debug/", name: polish.practice.debugger, blurb: polish.practice.debuggerIntro, icon: WrenchIcon },
      { href: "/practice/weak/", name: en.weak.title, blurb: en.weak.intro },
    ],
  },
  {
    id: "memory", title: cfop.hubs.practice.groups.memory.title, blurb: cfop.hubs.practice.groups.memory.blurb,
    tools: [
      { href: "/practice/pairs/", name: en.practice.pairs, blurb: en.practice.pairsBlurb },
      { href: "/practice/memory/", name: polish.practice.memory, blurb: polish.practice.memoryIntro, icon: BrainIcon },
    ],
  },
  {
    id: "reference", title: cfop.hubs.practice.groups.reference.title, blurb: cfop.hubs.practice.groups.reference.blurb,
    tools: [
      { href: "/practice/algorithms/", name: polish.practice.library, blurb: polish.practice.libraryIntro, icon: TableIcon },
      { href: "/practice/reference/", name: polish.practice.reference, blurb: polish.practice.referenceIntro, icon: FilePdfIcon },
      { href: "/practice/sandbox/", name: en.sandbox.link, blurb: en.sandbox.blurb },
      { href: "/practice/difficulty/", name: en.difficulty.link, blurb: en.difficulty.blurb },
      { href: "/practice/big-cubes/", name: polish.practice.big, blurb: polish.practice.bigIntro, icon: CubeIcon, inProgress: true },
    ],
  },
];

type Group = (typeof GROUPS)[number];

/** One skill group. `guide` names the page-guide step that points at it. */
function PracticeGroup({ guide, group }: { guide: string; group: Group }) {
  return (
    <section className="flex flex-col gap-5" aria-labelledby={`practice-${group.id}`} data-guide={guide}>
      <div className="flex flex-col gap-1"><h2 id={`practice-${group.id}`} className="t-heading">{group.title}</h2><p className="t-body text-quiet prose-measure">{group.blurb}</p></div>
      <ul className="tool-grid">
        {group.tools.map((tool) => {
          const Icon = tool.icon ?? TargetIcon;
          return (
            <li key={tool.href}>
              <TransitionLink href={tool.href} className="tool-link"><Icon className="tool-icon" weight="light" aria-hidden /><h3>{tool.name}{tool.inProgress === true ? <span className="t-meta text-quiet"> · {workspaces.big.buildingLabel}</span> : null}<CaretRightIcon size={18} aria-hidden /></h3><p>{tool.blurb}</p></TransitionLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function PracticePage() {
  const [f2l, lastLayer, blind, memory, reference] = GROUPS;
  if (f2l === undefined || lastLayer === undefined || blind === undefined || memory === undefined || reference === undefined) return null;
  return (
    <div className="workspace practice-directory flex flex-col gap-10">
      <header className="page-heading"><h1 className="t-title">{polish.practice.title}</h1><p className="t-body">{polish.practice.intro}</p></header>
      <PracticeGroup guide="practice-f2l" group={f2l} />
      <PracticeGroup guide="practice-last-layer" group={lastLayer} />
      <PracticeGroup guide="practice-drills" group={blind} />
      <PracticeGroup guide="practice-memory" group={memory} />
      <PracticeGroup guide="practice-workbench" group={reference} />
    </div>
  );
}
