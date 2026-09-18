import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { WorkspaceLoader } from "@/components/workspaces/workspace-loader";
import { en } from "@/i18n/en";
import { workspaces } from "@/i18n/workspaces";

export const metadata: Metadata = { title: workspaces.reference.title, description: workspaces.reference.intro, alternates: { canonical: "/practice/reference/" } };
export default function Page() {
  return <div className="workspace flex flex-col gap-8"><Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: workspaces.reference.title, href: "/practice/reference/" }]} /><header className="page-heading"><h1 className="t-title">{workspaces.reference.title}</h1><p className="t-body text-quiet max-w-[65ch]">{workspaces.reference.intro}</p></header><WorkspaceLoader view="reference" /></div>;
}
