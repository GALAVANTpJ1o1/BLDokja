"use client";

import { lessonDone, useLessonProgress } from "@/components/lesson/use-progress";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";
import { CheckIcon, CaretRightIcon } from "@phosphor-icons/react";

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

const TRACKS: readonly { readonly id: string; readonly title: string; readonly intro?: string }[] = [
  { id: "3bld", title: en.learn.track3bld },
  { id: "4bld", title: en.learn.track4bld, intro: en.learn.track4bldIntro },
  { id: "cfop", title: en.learn.trackCfop, intro: en.learn.trackCfopIntro },
  { id: "oh", title: en.learn.trackOh, intro: en.learn.trackOhIntro },
];

/**
 * The learning path, generated from lesson frontmatter (BRIEF §6: never hardcoded in a component), one
 * section per track. Every lesson is open; the first one not yet done is marked as next.
 */
export function LearningPath({ lessons }: { lessons: readonly PathLesson[] }) {
  const progress = useLessonProgress();
  const done = new Set(lessons.filter((l) => lessonDone(progress, l.id, l.checkpoints)).map((l) => l.id));
  const next = lessons.find((l) => !done.has(l.id));
  return (
    <div className="learning-path gap-y-10">
      <nav className="learning-track-nav" aria-label={en.learn.tracks}>
        {TRACKS.filter((track) => lessons.some((lesson) => lesson.track === track.id)).map((track) => (
          <a key={track.id} className="btn" href={`#track-${track.id}`}>{track.title}</a>
        ))}
      </nav>
      {TRACKS.map((track) => {
        const inTrack = lessons.filter((l) => l.track === track.id);
        if (inTrack.length === 0) return null;
        return (
          <section key={track.id} className="learning-track flex flex-col gap-3" aria-labelledby={`track-${track.id}`}>
            <h2 id={`track-${track.id}`} className="t-heading">{track.title}</h2>
            {track.intro !== undefined ? <p className="t-body text-quiet prose-measure">{track.intro}</p> : null}
            <TrackLessons lessons={inTrack} done={done} next={track.id === "cfop" || track.id === "oh" ? inTrack.find((lesson) => !done.has(lesson.id)) : next} />
          </section>
        );
      })}
    </div>
  );
}

function TrackLessons({ lessons, done, next }: { lessons: readonly PathLesson[]; done: ReadonlySet<string>; next: PathLesson | undefined }) {
  return (
    <ol className="learning-lessons flex flex-col">
      {lessons.map((lesson) => {
        const status = done.has(lesson.id) ? en.learn.done : next?.id === lesson.id ? en.learn.next : en.learn.notStarted;
        return (
          <li key={lesson.id} className="learning-lesson" data-status={done.has(lesson.id) ? "done" : next?.id === lesson.id ? "next" : "new"}>
            <span className="learning-order mono">{done.has(lesson.id) ? <CheckIcon size={14} aria-hidden /> : lesson.order}</span>
            <div className="flex flex-col gap-1">
              <TransitionLink href={`/learn/${lesson.id}/`} className={`t-subheading ${next?.id === lesson.id ? "font-[700]" : ""}`}>
                {lesson.title}
              </TransitionLink>
              <span className="t-body text-quiet">{lesson.objective}</span>
              <span className="t-meta text-quiet">{en.learn.minutes(lesson.minutes)}</span>
            </div>
            <span className="learning-lesson-state">{status}<CaretRightIcon size={14} aria-hidden /></span>
          </li>
        );
      })}
    </ol>
  );
}
