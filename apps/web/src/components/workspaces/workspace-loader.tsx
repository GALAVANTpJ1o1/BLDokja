"use client";

import dynamic from "next/dynamic";
import { workspaces } from "@/i18n/workspaces";

const loading = () => <p className="status-line t-meta min-h-64" role="status">{workspaces.common.loading}</p>;
const views = {
  speffz: dynamic(() => import("./speffz-trainer").then(module => module.SpeffzTrainer), { ssr: false, loading }),
  "first-solve": dynamic(() => import("./first-solve").then((module) => module.FirstSolve), { ssr: false, loading }),
  debug: dynamic(() => import("./dnf-debugger").then((module) => module.DnfDebugger), { ssr: false, loading }),
  levels: dynamic(() => import("./progressive-trainer").then((module) => module.ProgressiveTrainer), { ssr: false, loading }),
  algorithms: dynamic(() => import("./algorithm-library").then((module) => module.AlgorithmLibrary), { ssr: false, loading }),
  memory: dynamic(() => import("./memory-workspace").then((module) => module.MemoryWorkspace), { ssr: false, loading }),
  reference: dynamic(() => import("./reference-sheet").then((module) => module.ReferenceSheet), { ssr: false, loading }),
  "big-cubes": dynamic(() => import("./big-cubes").then((module) => module.BigCubes), { ssr: false, loading }),
};

export function WorkspaceLoader({ view }: { view: keyof typeof views }) {
  const View = views[view];
  return <div className={`workspace-${view}`}><View /></div>;
}
