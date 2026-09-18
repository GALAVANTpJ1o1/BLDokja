import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { en } from "@/i18n/en";
import { M2OpTrainerLoader } from "./loader";

export const metadata: Metadata = { title: en.m2op.title, description: en.m2op.intro, alternates: { canonical: "/practice/m2op/" } };

export default function M2OpPage() {
  return (
    <>
      <Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: en.m2op.title, href: "/practice/m2op/" }]} />
      <M2OpTrainerLoader />
    </>
  );
}
