import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { SandboxLoader } from "./loader";

export const metadata: Metadata = { title: en.sandbox.title, description: en.sandbox.intro, alternates: { canonical: "/practice/sandbox/" } };

export default function SandboxPage() {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <h1 className="t-title">{en.sandbox.title}</h1>
      <p className="t-body prose-measure">{en.sandbox.intro}</p>
      <SandboxLoader />
    </div>
  );
}
