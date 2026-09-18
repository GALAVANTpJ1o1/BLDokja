import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { en } from "@/i18n/en";
import { ThreeStyleLoader } from "./loader";

export const metadata: Metadata = { title: en.threeStyle.title, description: en.threeStyle.intro, alternates: { canonical: "/practice/3style/" } };

export default function ThreeStylePage() {
  return (
    <>
      <Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: en.threeStyle.title, href: "/practice/3style/" }]} />
      <ThreeStyleLoader />
    </>
  );
}
