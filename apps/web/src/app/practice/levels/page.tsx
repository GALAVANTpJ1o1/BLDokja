import type { Metadata } from "next";
import { WorkspaceLoader } from "@/components/workspaces/workspace-loader";
import { workspaces } from "@/i18n/workspaces";

export const metadata: Metadata = { title: workspaces.levels.title, description: workspaces.levels.intro, alternates: { canonical: "/practice/levels/" } };
export default function Page() {
  return <div className="workspace flex flex-col gap-8"><header className="page-heading"><h1 className="t-title">{workspaces.levels.title}</h1><p className="t-body text-quiet max-w-[65ch]">{workspaces.levels.intro}</p></header><WorkspaceLoader view="levels" /></div>;
}
