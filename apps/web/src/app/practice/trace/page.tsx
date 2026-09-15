import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { TraceTrainerLoader } from "./loader";

export const metadata: Metadata = { title: en.trace.title };

export default function TracePage() {
  return <TraceTrainerLoader />;
}
