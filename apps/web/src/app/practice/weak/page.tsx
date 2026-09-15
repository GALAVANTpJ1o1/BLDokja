import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { WeakLoader } from "./loader";

export const metadata: Metadata = { title: en.weak.title };

export default function WeakPage() {
  return <WeakLoader />;
}
