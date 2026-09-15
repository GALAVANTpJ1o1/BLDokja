import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/i18n/en";
import { FLAGS } from "@/lib/flags";
import { LabView } from "./lab-view";

export const metadata: Metadata = { title: en.lab.title, robots: { index: false } };

export default function LabPage() {
  if (!FLAGS.lab) notFound();
  return <LabView />;
}
