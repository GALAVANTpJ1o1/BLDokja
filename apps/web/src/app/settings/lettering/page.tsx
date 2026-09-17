import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { LetteringLoader } from "./loader";

export const metadata: Metadata = { title: en.scheme.title };

export default function LetteringPage() {
  return (
    <div className="settings-stack lettering-workbench flex max-w-3xl flex-col gap-6">
      <header className="page-heading"><h1 className="t-title">{en.scheme.title}</h1>
      <p className="t-body prose-measure">{en.scheme.intro}</p></header>
      <LetteringLoader />
    </div>
  );
}
