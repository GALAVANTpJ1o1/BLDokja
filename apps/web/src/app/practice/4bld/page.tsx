import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { FourBldTrainerLoader } from "./loader";

export const metadata: Metadata = { title: en.fourBld.title };

export default function FourBldPage() {
  return <FourBldTrainerLoader />;
}
