import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { WorkspaceLoader } from "@/components/workspaces/workspace-loader";
import { en } from "@/i18n/en";
import { workspaces } from "@/i18n/workspaces";

export const metadata: Metadata = { title: workspaces.memory.title, description: workspaces.memory.intro, alternates: { canonical: "/practice/memory/" } };
export default function Page() {
  return <div className="workspace flex flex-col gap-8"><Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: workspaces.memory.title, href: "/practice/memory/" }]} /><header className="page-heading"><h1 className="t-title">{workspaces.memory.title}</h1><p className="t-body text-quiet max-w-[65ch]">{workspaces.memory.intro}</p></header><WorkspaceLoader view="memory" /></div>;
}
