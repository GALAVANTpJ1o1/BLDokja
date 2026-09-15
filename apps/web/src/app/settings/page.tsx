import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: en.settings.title };

export default function SettingsPage() {
  return <SettingsView />;
}
