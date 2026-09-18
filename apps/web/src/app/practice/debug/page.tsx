import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { WorkspaceLoader } from "@/components/workspaces/workspace-loader";
import { en } from "@/i18n/en";
import { workspaces } from "@/i18n/workspaces";

export const metadata: Metadata = { title: workspaces.debug.title, description: workspaces.debug.intro, alternates: { canonical: "/practice/debug/" } };
export default function Page() {
  return <div className="workspace flex flex-col gap-8"><Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: workspaces.debug.title, href: "/practice/debug/" }]} /><header className="page-heading"><h1 className="t-title">{workspaces.debug.title}</h1><p className="t-body text-quiet max-w-[65ch]">{workspaces.debug.intro}</p></header><WorkspaceLoader view="debug" /></div>;
}
