import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { WorkspaceLoader } from "@/components/workspaces/workspace-loader";
import { en } from "@/i18n/en";
import { workspaces } from "@/i18n/workspaces";

export const metadata: Metadata = { title: workspaces.algs.title, description: workspaces.algs.intro, alternates: { canonical: "/practice/algorithms/" } };
export default function Page() {
  return <div className="workspace flex flex-col gap-8"><Breadcrumbs trail={[{ label: en.nav.practice, href: "/practice/" }, { label: workspaces.algs.title, href: "/practice/algorithms/" }]} /><header className="page-heading"><h1 className="t-title">{workspaces.algs.title}</h1><p className="t-body text-quiet max-w-[65ch]">{workspaces.algs.intro}</p></header><WorkspaceLoader view="algorithms" /></div>;
}
