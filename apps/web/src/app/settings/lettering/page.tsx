import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { en } from "@/i18n/en";
import { LetteringLoader } from "./loader";

export const metadata: Metadata = { title: en.scheme.title, description: en.scheme.intro, alternates: { canonical: "/settings/lettering/" } };

export default function LetteringPage() {
  return (
    <div className="lettering-workbench">
      <Breadcrumbs trail={[{ label: en.nav.settings, href: "/settings/" }, { label: en.scheme.title, href: "/settings/lettering/" }]} />
      <header className="page-heading"><h1 className="t-title">{en.scheme.title}</h1>
      <p className="t-body prose-measure">{en.scheme.intro}</p></header>
      <LetteringLoader />
    </div>
  );
}
