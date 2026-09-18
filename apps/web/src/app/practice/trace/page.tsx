import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { TraceTrainerLoader } from "./loader";

export const metadata: Metadata = { title: en.trace.title, description: en.trace.intro, alternates: { canonical: "/practice/trace/" } };

export default function TracePage() {
  return <TraceTrainerLoader />;
}
