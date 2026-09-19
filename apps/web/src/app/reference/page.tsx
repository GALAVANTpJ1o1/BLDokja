import type { Metadata } from "next";
import { CaretRightIcon, GridFourIcon } from "@phosphor-icons/react/dist/ssr";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { TransitionLink } from "@/components/transitions/transition-link";
import { REFERENCE_SHEETS } from "@/content/cfop";
import { cfop } from "@/i18n/cfop";

export const metadata: Metadata = { title: cfop.sheet.sheetsTitle, description: cfop.sheet.sheetsIntro, alternates: { canonical: "/reference/" } };

export default function ReferenceIndex() {
  return (
    <div className="workspace flex flex-col gap-8">
      <Breadcrumbs trail={[{ label: cfop.sheet.sheetsTitle, href: "/reference/" }]} />
      <header className="page-heading" data-guide="reference-header"><h1 className="t-title">{cfop.sheet.sheetsTitle}</h1><p className="t-body text-quiet max-w-[65ch]">{cfop.sheet.sheetsIntro}</p></header>
      <ul className="tool-grid" data-guide="reference-index">
        {REFERENCE_SHEETS.map((sheet) => (
          <li key={sheet}>
            <TransitionLink href={`/reference/${sheet}/`} className="tool-link"><GridFourIcon className="tool-icon" weight="light" aria-hidden /><h2>{cfop.sheet.title[sheet]}<CaretRightIcon size={18} aria-hidden /></h2><p>{cfop.sheet.intro[sheet]}</p></TransitionLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
