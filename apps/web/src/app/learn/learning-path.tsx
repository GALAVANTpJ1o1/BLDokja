"use client";

import { lessonDone, useLessonProgress } from "@/components/lesson/use-progress";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";

export interface PathLesson {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly track: string;
  readonly minutes: number;
  readonly prerequisites: readonly string[];
  readonly checkpoints: readonly string[];
  readonly objective: string;
}

/**
 * The learning path, generated from lesson frontmatter (BRIEF §6: never hardcoded in a component).
 * Every lesson is open; the first one not yet done is marked as next.
 */
export function LearningPath({ lessons }: { lessons: readonly PathLesson[] }) {
  const progress = useLessonProgress();
  const done = new Set(lessons.filter((l) => lessonDone(progress, l.id, l.checkpoints)).map((l) => l.id));
  const next = lessons.find((l) => !done.has(l.id));
  return (
    <ol className="flex flex-col">
      {lessons.map((lesson) => {
        const status = done.has(lesson.id) ? en.learn.done : next?.id === lesson.id ? en.learn.next : en.learn.notStarted;
        return (
          <li key={lesson.id} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-t border-rule py-4">
            <span className={`t-subheading mono ${done.has(lesson.id) ? "" : "text-quiet"}`}>{lesson.order}</span>
            <div className="flex flex-col gap-1">
              <TransitionLink href={`/learn/${lesson.id}/`} className={`t-subheading ${next?.id === lesson.id ? "font-[700]" : ""}`}>
                {lesson.title}
              </TransitionLink>
              <span className="t-body text-quiet">{lesson.objective}</span>
              <span className="t-meta">
                {status} · {en.learn.minutes(lesson.minutes)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
