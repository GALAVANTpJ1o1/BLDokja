import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { en } from "@/i18n/en";
import { PairsLibraryLoader } from "./loader";

export const metadata: Metadata = { title: en.pairs.title, description: en.pairs.intro, alternates: { canonical: "/practice/pairs/" } };

export default function PairsPage() {
  return (
    <>
      <Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: en.pairs.title, href: "/practice/pairs/" }]} />
      <PairsLibraryLoader />
    </>
  );
}
