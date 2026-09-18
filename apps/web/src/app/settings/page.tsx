import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { redesign } from "@/i18n/redesign";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: en.settings.title, description: redesign.settingsIntro, alternates: { canonical: "/settings/" } };

export default function SettingsPage() {
  return <SettingsView />;
}
