import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseReference } from "@/components/cfop/case-reference";
import { ProfileScope } from "@/components/cube/profile-scope";
import { TransitionLink } from "@/components/transitions/transition-link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { REFERENCE_SHEETS, type ReferenceSheet } from "@/content/cfop";
import { cfop } from "@/i18n/cfop";

export const dynamicParams = false;

export function generateStaticParams() {
  return REFERENCE_SHEETS.map((sheet) => ({ sheet }));
}

const LESSON: Record<ReferenceSheet, string> = {
  f2l: "cfop-advanced-intuitive-f2l", "2look-oll": "cfop-two-look-oll", "2look-pll": "cfop-two-look-pll", oll: "cfop-full-oll", pll: "cfop-full-pll",
};
const PRACTICE: Record<ReferenceSheet, { readonly href: string; readonly label: string }> = {
  f2l: { href: "/practice/f2l/", label: cfop.sheet.f2lPractice },
  "2look-oll": { href: "/practice/last-layer/?mode=2look-oll", label: cfop.sheet.practise },
  "2look-pll": { href: "/practice/last-layer/?mode=2look-pll", label: cfop.sheet.practise },
  oll: { href: "/practice/last-layer/?mode=1look-oll", label: cfop.sheet.practise },
  pll: { href: "/practice/last-layer/?mode=1look-pll", label: cfop.sheet.practise },
};

function sheetOf(value: string): ReferenceSheet | undefined {
  return REFERENCE_SHEETS.find((sheet) => sheet === value);
}

export async function generateMetadata({ params }: { params: Promise<{ sheet: string }> }): Promise<Metadata> {
  const sheet = sheetOf((await params).sheet);
  if (sheet === undefined) return {};
  return { title: cfop.sheet.title[sheet], description: cfop.sheet.intro[sheet], alternates: { canonical: `/reference/${sheet}/` } };
}

export default async function ReferencePage({ params }: { params: Promise<{ sheet: string }> }) {
  const sheet = sheetOf((await params).sheet);
  if (sheet === undefined) notFound();
  const practice = PRACTICE[sheet];
  return (
    <ProfileScope profile="CFOP">
      <div className="workspace flex flex-col gap-8">
        <Breadcrumbs trail={[{ label: cfop.sheet.sheetsTitle, href: "/reference/" }, { label: cfop.sheet.title[sheet], href: `/reference/${sheet}/` }]} />
        <header className="page-heading flex flex-col gap-3">
          <h1 className="t-title">{cfop.sheet.title[sheet]}</h1>
          <p className="t-body text-quiet max-w-[65ch]">{cfop.sheet.intro[sheet]}</p>
          <div className="control-row" data-guide="reference-links">
            <TransitionLink className="btn btn-strong" href={practice.href}>{practice.label}</TransitionLink>
            <TransitionLink className="btn" href={`/learn/${LESSON[sheet]}/`}>{cfop.sheet.learn}</TransitionLink>
          </div>
        </header>
        <CaseReference sheet={sheet} />
      </div>
    </ProfileScope>
  );
}
