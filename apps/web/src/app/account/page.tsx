import type { Metadata } from "next";
import { account } from "@/i18n/account";
import { en } from "@/i18n/en";
import { AccountView } from "./account-view";

export const metadata: Metadata = { title: en.nav.account, description: account.metaDescription, alternates: { canonical: "/account/" } };

export default function AccountPage() {
  return <AccountView />;
}
