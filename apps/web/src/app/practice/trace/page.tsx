import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { en } from "@/i18n/en";
import { TraceTrainerLoader } from "./loader";

export const metadata: Metadata = { title: en.trace.title, description: en.trace.intro, alternates: { canonical: "/practice/trace/" } };

export default function TracePage() {
  return (
    <>
      <Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: en.trace.title, href: "/practice/trace/" }]} />
      <TraceTrainerLoader />
    </>
  );
}
