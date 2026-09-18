import type { Metadata } from "next";
import { en } from "@/i18n/en";
import { AccountView } from "./account-view";

export const metadata: Metadata = { title: en.nav.account };

export default function AccountPage() {
  return <AccountView />;
}
