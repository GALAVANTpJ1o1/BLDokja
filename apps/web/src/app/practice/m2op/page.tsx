import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { M2OpTrainerLoader } from "./loader";

export const metadata: Metadata = { title: en.m2op.title };

export default function M2OpPage() {
  return <M2OpTrainerLoader />;
}
