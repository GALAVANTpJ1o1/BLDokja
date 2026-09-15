import type { Metadata } from "next";
import { loadLessons } from "@/content/lessons/source";
import { en } from "@/i18n/en";
import { LearningPath } from "./learning-path";

export const metadata: Metadata = { title: en.learn.title };

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
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="t-title">{en.learn.title}</h1>
      <p className="t-body prose-measure">{en.learn.intro}</p>
      {lessons.length === 0 ? <p className="t-body text-quiet">{en.learn.empty}</p> : <LearningPath lessons={lessons} />}
    </div>
  );
}
