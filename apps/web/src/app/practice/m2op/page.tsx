import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { M2OpTrainerLoader } from "./loader";

export const metadata: Metadata = { title: en.m2op.title, description: en.m2op.intro, alternates: { canonical: "/practice/m2op/" } };

export default function M2OpPage() {
  return <M2OpTrainerLoader />;
}
