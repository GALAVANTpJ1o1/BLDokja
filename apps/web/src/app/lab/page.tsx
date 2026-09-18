import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/i18n/en";
import { FLAGS } from "@/lib/flags";
import { LabView } from "./lab-view";

export const metadata: Metadata = { title: en.lab.title, description: en.lab.intro, robots: { index: false }, alternates: { canonical: "/lab/" } };

export default function LabPage() {
  if (!FLAGS.lab) notFound();
  return <LabView />;
}
