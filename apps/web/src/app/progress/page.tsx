import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { ProgressLoader } from "./loader";

export const metadata: Metadata = { title: en.progress.title };

export default function ProgressPage() {
  return <ProgressLoader />;
}
