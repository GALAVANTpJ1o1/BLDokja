import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { DifficultyLoader } from "./loader";

export const metadata: Metadata = { title: en.difficulty.title, description: en.difficulty.intro, alternates: { canonical: "/practice/difficulty/" } };

export default function DifficultyPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="t-title">{en.difficulty.title}</h1>
      <p className="t-body prose-measure">{en.difficulty.intro}</p>
      <DifficultyLoader />
    </div>
  );
}
