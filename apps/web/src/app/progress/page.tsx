import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { ProgressLoader } from "./loader";

export const metadata: Metadata = { title: en.progress.title, description: en.analytics.intro, alternates: { canonical: "/progress/" } };

export default function ProgressPage() {
  return (
    <div className="progress-workbench flex max-w-5xl flex-col gap-6">
      <header className="page-heading"><h1 className="t-title">{en.analytics.title}</h1>
      <p className="t-body prose-measure">{en.analytics.intro}</p></header>
      <ProgressLoader />
    </div>
  );
}
