import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { ThreeStyleLoader } from "./loader";

export const metadata: Metadata = { title: en.threeStyle.title };

export default function ThreeStylePage() {
  return <ThreeStyleLoader />;
}
