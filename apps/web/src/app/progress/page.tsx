import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { ProgressView } from "./progress-view";

export const metadata: Metadata = { title: en.progress.title };

export default function ProgressPage() {
  return <ProgressView />;
}
