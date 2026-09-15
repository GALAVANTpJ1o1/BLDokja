import type { Voice } from "@bld/storage";
import type { Metadata } from "next";
import { compileMDX } from "next-mdx-remote/rsc";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LessonView } from "@/components/lesson/lesson-view";
import { MDX_COMPONENTS } from "@/components/lesson/mdx-components";
import { findLesson, loadLessons } from "@/content/lessons/source";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadLessons().map((l) => ({ lesson: l.frontmatter.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ lesson: string }> }): Promise<Metadata> {
  const { lesson } = await params;
  const source = findLesson(lesson);
  return { title: source?.frontmatter.title ?? lesson, ...(source === undefined ? {} : { description: source.frontmatter.objectives.join(" ") }) };
}

/**
 * A lesson, compiled from /content at build time. Each voice is compiled separately; lesson files
 * can't run JavaScript (next-mdx-remote's `blockJS`), only use the components in MDX_COMPONENTS.
 */
export default async function LessonPage({ params }: { params: Promise<{ lesson: string }> }) {
  const { lesson } = await params;
  const source = findLesson(lesson);
  if (source === undefined) notFound();
  const variants: Partial<Record<Voice, ReactNode>> = {};
  for (const [voice, body] of Object.entries(source.bodies) as [Voice, string][]) {
    const { content } = await compileMDX({ source: body, components: MDX_COMPONENTS, options: { blockJS: true } });
    variants[voice] = content;
  }
  const lessons = loadLessons()
    .filter((l) => l.frontmatter.track === source.frontmatter.track)
    .map((l) => ({ id: l.frontmatter.id, title: l.frontmatter.title, checkpoints: l.frontmatter.checkpoints.map((c) => c.id) }));
  return <LessonView frontmatter={source.frontmatter} variants={variants} lessons={lessons} />;
}
