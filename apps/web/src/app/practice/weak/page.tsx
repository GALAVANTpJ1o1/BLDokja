import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { WeakLoader } from "./loader";

export const metadata: Metadata = { title: en.weak.title, description: en.weak.intro, alternates: { canonical: "/practice/weak/" } };

export default function WeakPage() {
  return <WeakLoader />;
}
