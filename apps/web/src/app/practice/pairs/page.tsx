import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { PairsLibraryLoader } from "./loader";

export const metadata: Metadata = { title: en.pairs.title, description: en.pairs.intro, alternates: { canonical: "/practice/pairs/" } };

export default function PairsPage() {
  return <PairsLibraryLoader />;
}
