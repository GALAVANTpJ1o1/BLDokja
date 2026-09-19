import type { Metadata } from "next";
import { Suspense } from "react";
import { F2LPracticePage } from "@/components/cfop/f2l-practice";
import { ProfileScope } from "@/components/cube/profile-scope";
import { TransitionLink } from "@/components/transitions/transition-link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { cfop } from "@/i18n/cfop";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: cfop.f2lPractice.title, description: cfop.f2lPractice.intro, alternates: { canonical: "/practice/f2l/" } };

export default function F2LPractice() {
  return (
    <ProfileScope profile="CFOP">
      <div className="workspace flex flex-col gap-8">
        <Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: cfop.f2lPractice.title, href: "/practice/f2l/" }]} />
        <header className="page-heading flex flex-col gap-3" data-guide="f2l-header">
          <h1 className="t-title">{cfop.f2lPractice.title}</h1>
          <p className="t-body text-quiet max-w-[65ch]">{cfop.f2lPractice.intro}</p>
          <div className="control-row">
            <TransitionLink className="btn" href="/learn/cfop-pairing-extraction/">{cfop.sheet.learn}</TransitionLink>
            <TransitionLink className="btn" href="/reference/f2l/">{cfop.sheet.cheats}</TransitionLink>
          </div>
        </header>
        <Suspense fallback={null}><F2LPracticePage /></Suspense>
      </div>
    </ProfileScope>
  );
}
