import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { WorkspaceLoader } from "@/components/workspaces/workspace-loader";
import { en } from "@/i18n/en";
import { workspaces } from "@/i18n/workspaces";

export const metadata: Metadata = { title: workspaces.first.title, description: workspaces.first.intro, alternates: { canonical: "/practice/first-solve/" } };
export default function Page() {
  return <div className="workspace flex flex-col gap-8"><Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: workspaces.first.title, href: "/practice/first-solve/" }]} /><header className="page-heading"><h1 className="t-title">{workspaces.first.title}</h1><p className="t-body text-quiet max-w-[65ch]">{workspaces.first.intro}</p></header><WorkspaceLoader view="first-solve" /></div>;
}
