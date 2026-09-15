import type { Metadata } from "next";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: en.learn.title };

export default function LearnPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="t-title">{en.learn.title}</h1>
      <p className="t-body prose-measure">{en.learn.intro}</p>
      <p className="t-body text-quiet">{en.learn.empty}</p>
    </div>
  );
}
