import type { Metadata } from "next";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: en.practice.title };

const TRAINERS = [
  { name: en.practice.trace, blurb: en.practice.traceBlurb },
  { name: en.practice.m2op, blurb: en.practice.m2opBlurb },
  { name: en.practice.pairs, blurb: en.practice.pairsBlurb },
] as const;

export default function PracticePage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="t-title">{en.practice.title}</h1>
      <p className="t-body prose-measure">{en.practice.intro}</p>
      <ul className="flex flex-col">
        {TRAINERS.map((t) => (
          <li key={t.name} className="flex flex-col gap-1 border-t border-rule py-4">
            <span className="t-subheading">{t.name}</span>
            <span className="t-body text-quiet">{t.blurb}</span>
            <span className="t-meta">{en.practice.comingSoon}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
