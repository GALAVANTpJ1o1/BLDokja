import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { FourBldTrainerLoader } from "./loader";

export const metadata: Metadata = { title: en.fourBld.title, description: en.fourBld.intro, alternates: { canonical: "/practice/4bld/" } };

export default function FourBldPage() {
  return <FourBldTrainerLoader />;
}
