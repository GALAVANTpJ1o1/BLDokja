import type { Metadata } from "next";
import { loadLessons } from "@/content/lessons/source";
import { en } from "@/i18n/en";
import { workspaces } from "@/i18n/workspaces";
import { Cube } from "@/components/cube/cube";
import { LearningPath } from "./learning-path";

export const metadata: Metadata = { title: en.learn.title, description: en.learn.intro, alternates: { canonical: "/learn/" } };

export default function LearnPage() {
  const lessons = loadLessons().map((l) => ({
    id: l.frontmatter.id,
    title: l.frontmatter.title,
    order: l.frontmatter.order,
    track: l.frontmatter.track,
    minutes: l.frontmatter.estimatedMinutes,
    prerequisites: l.frontmatter.prerequisites,
    checkpoints: l.frontmatter.checkpoints.map((c) => c.id),
    objective: l.frontmatter.objectives[0] ?? "",
  }));
  return (
    <div className="workspace learning-index flex flex-col gap-10">
      <header className="learning-intro grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-center" data-guide="learn-intro">
        <div className="flex flex-col gap-4"><h1 className="t-title">{en.learn.title}</h1><p className="t-body prose-measure">{en.learn.intro}</p><a className="text-link self-start" href="/practice/first-solve/">{workspaces.first.title}</a></div>
        <div className="max-w-sm w-full justify-self-center"><Cube setup="R U R'" label={en.learn.title} /></div>
      </header>
      {lessons.length === 0 ? <p className="t-body text-quiet">{en.learn.empty}</p> : <LearningPath lessons={lessons} />}
      <a className="tool-link" href="/practice/big-cubes/"><span className="t-heading">{workspaces.big.title}</span><span className="t-body text-quiet">{workspaces.big.intro}</span></a>
    </div>
  );
}
