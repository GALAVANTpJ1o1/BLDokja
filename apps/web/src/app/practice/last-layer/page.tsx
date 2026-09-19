import type { Metadata } from "next";
import { Suspense } from "react";
import { LlTrainer } from "@/components/cfop/ll-trainer";
import { ProfileScope } from "@/components/cube/profile-scope";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { cfop } from "@/i18n/cfop";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: cfop.trainer.title, description: cfop.trainer.intro, alternates: { canonical: "/practice/last-layer/" } };

export default function LastLayerPractice() {
  return (
    <ProfileScope profile="CFOP">
      <div className="workspace flex flex-col gap-8">
        <Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: cfop.trainer.title, href: "/practice/last-layer/" }]} />
        <header className="page-heading flex flex-col gap-3" data-guide="trainer-header">
          <h1 className="t-title">{cfop.trainer.title}</h1>
          <p className="t-body text-quiet max-w-[65ch]">{cfop.trainer.intro}</p>
        </header>
        <Suspense fallback={null}><LlTrainer /></Suspense>
      </div>
    </ProfileScope>
  );
}
