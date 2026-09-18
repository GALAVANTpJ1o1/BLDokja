import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { ThreeStyleLoader } from "./loader";

export const metadata: Metadata = { title: en.threeStyle.title, description: en.threeStyle.intro, alternates: { canonical: "/practice/3style/" } };

export default function ThreeStylePage() {
  return <ThreeStyleLoader />;
}
