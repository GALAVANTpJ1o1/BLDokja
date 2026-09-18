import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { WorkspaceLoader } from "@/components/workspaces/workspace-loader";
import { en } from "@/i18n/en";
import { speffz } from "@/i18n/speffz";
export const metadata: Metadata = { title: speffz.title, description: speffz.intro, alternates: { canonical: "/practice/speffz/" } };
export default function Page() {
  return <div className="workspace flex flex-col gap-6"><Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: speffz.title, href: "/practice/speffz/" }]} /><header className="page-heading"><h1 className="t-title">{speffz.title}</h1><p className="t-body text-quiet max-w-[65ch]">{speffz.intro}</p></header><WorkspaceLoader view="speffz" /></div>;
}
