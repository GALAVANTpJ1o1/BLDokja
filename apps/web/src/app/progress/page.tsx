import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { ProgressLoader } from "./loader";

export const metadata: Metadata = { title: en.progress.title };

export default function ProgressPage() {
  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <h1 className="t-title">{en.analytics.title}</h1>
      <p className="t-body prose-measure">{en.analytics.intro}</p>
      <ProgressLoader />
    </div>
  );
}
