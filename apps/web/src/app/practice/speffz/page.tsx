import type { Metadata } from "next";
import { WorkspaceLoader } from "@/components/workspaces/workspace-loader";
import { speffz } from "@/i18n/speffz";
export const metadata: Metadata = { title: speffz.title };
export default function Page() {
  return <div className="workspace flex flex-col gap-6"><header className="page-heading"><h1 className="t-title">{speffz.title}</h1><p className="t-body text-quiet max-w-[65ch]">{speffz.intro}</p></header><WorkspaceLoader view="speffz" /></div>;
}
