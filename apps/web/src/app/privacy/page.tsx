import type { Metadata } from "next";
import { TransitionLink } from "@/components/transitions/transition-link";
import { privacy } from "@/i18n/privacy";

export const metadata: Metadata = { title: privacy.title, description: privacy.metaDescription, alternates: { canonical: "/privacy/" } };

const SECTIONS = [privacy.sections.local, privacy.sections.account, privacy.sections.leaderboards, privacy.sections.thirdParties, privacy.sections.contact] as const;

export default function PrivacyPage() {
  return (
    <div className="workspace flex flex-col gap-8">
      <header className="page-heading">
        <h1 className="t-title">{privacy.title}</h1>
        <p className="t-body">{privacy.intro}</p>
        <p className="t-meta text-quiet">{privacy.updated}</p>
      </header>
      {SECTIONS.map((section) => (
        <section key={section.title} className="flex flex-col gap-3 border-t border-rule pt-6">
          <h2 className="t-heading">{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="t-body prose-measure">{paragraph}</p>
          ))}
          {section === privacy.sections.contact ? <TransitionLink href="/contact/" className="text-link self-start">{privacy.sections.contact.linkLabel}</TransitionLink> : null}
        </section>
      ))}
    </div>
  );
}
