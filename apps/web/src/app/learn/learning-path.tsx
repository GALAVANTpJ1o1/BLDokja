"use client";

import { lessonDone, useLessonProgress } from "@/components/lesson/use-progress";
import { TransitionLink } from "@/components/transitions/transition-link";
import { cfop } from "@/i18n/cfop";
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

/** The CFOP track in the order a learner meets it (polish brief §61): F2L first, then the two-look last layer, then the advanced parts. */
const CFOP_GROUPS: readonly { readonly title: string; readonly ids: readonly string[] }[] = [
  { title: cfop.hubs.learn.cfopGroups.foundations, ids: ["cfop-notation"] },
  { title: cfop.hubs.learn.cfopGroups.f2l, ids: ["cfop-paired-insertions", "cfop-pairing-extraction"] },
  { title: cfop.hubs.learn.cfopGroups.twoLook, ids: ["cfop-last-layer-concepts", "cfop-two-look-oll", "cfop-two-look-pll"] },
  { title: cfop.hubs.learn.cfopGroups.advanced, ids: ["cfop-advanced-intuitive-f2l"] },
  { title: cfop.hubs.learn.cfopGroups.full, ids: ["cfop-full-oll", "cfop-full-pll"] },
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
      <section className="flex flex-col gap-3" aria-labelledby="learn-paths" data-guide="learn-tracks">
        <h2 id="learn-paths" className="t-heading">{cfop.hubs.learn.paths}</h2>
        <p className="t-body text-quiet prose-measure">{cfop.hubs.learn.pathsIntro}</p>
        <div className="path-grid">
          {([["3bld", cfop.hubs.learn.bld, ["3bld", "4bld"]], ["cfop", cfop.hubs.learn.cfop, ["cfop"]], ["oh", cfop.hubs.learn.oh, ["oh"]]] as const).map(([anchor, copy, tracks]) => {
            const inPath = lessons.filter((lesson) => (tracks as readonly string[]).includes(lesson.track));
            return (
              <a key={anchor} className="path-card" href={`#track-${anchor}`}>
                <h3>{copy.title}</h3>
                <p className="t-body text-quiet">{copy.blurb}</p>
                <span className="t-meta text-quiet">{cfop.hubs.learn.lessons(inPath.length)} · {inPath.filter((lesson) => done.has(lesson.id)).length} / {inPath.length} {en.learn.done.toLowerCase()}</span>
              </a>
            );
          })}
          <TransitionLink className="path-card" href="/practice/"><h3>{cfop.hubs.home.practice}</h3><p className="t-body text-quiet">{cfop.hubs.home.practiceBlurb}</p><span className="t-meta text-quiet">{cfop.hubs.practice.f2l}, {cfop.hubs.practice.lastLayer}</span></TransitionLink>
        </div>
      </section>
      {TRACKS.map((track) => {
        const inTrack = lessons.filter((l) => l.track === track.id);
        if (inTrack.length === 0) return null;
        return (
          <section key={track.id} className="learning-track flex flex-col gap-3" aria-labelledby={`track-${track.id}`}>
            <h2 id={`track-${track.id}`} className="t-heading">{track.title}</h2>
            {track.intro !== undefined ? <p className="t-body text-quiet prose-measure">{track.intro}</p> : null}
            {track.id === "cfop" ? (
              <div className="flex flex-col gap-5">
                <p className="t-meta text-quiet">{cfop.hubs.learn.cfopOrder}</p>
                {CFOP_GROUPS.map((group) => {
                  const groupLessons = inTrack.filter((lesson) => group.ids.includes(lesson.id));
                  return groupLessons.length === 0 ? null : (
                    <div key={group.title} className="flex flex-col gap-2"><h3 className="t-subheading">{group.title}</h3><TrackLessons lessons={groupLessons} done={done} next={inTrack.find((lesson) => !done.has(lesson.id))} /></div>
                  );
                })}
                <div className="control-row" data-guide="learn-cfop-links">
                  <TransitionLink className="btn btn-strong" href="/practice/f2l/">{cfop.sheet.f2lPractice}</TransitionLink>
                  <TransitionLink className="btn" href="/practice/last-layer/">{cfop.trainer.title}</TransitionLink>
                  <TransitionLink className="btn" href="/reference/">{cfop.sheet.sheetsTitle}</TransitionLink>
                </div>
              </div>
            ) : <TrackLessons lessons={inTrack} done={done} next={track.id === "oh" ? inTrack.find((lesson) => !done.has(lesson.id)) : next} />}
          </section>
        );
      })}
    </div>
  );
}

function TrackLessons({ lessons, done, next }: { lessons: readonly PathLesson[]; done: ReadonlySet<string>; next: PathLesson | undefined }) {
  return (
    <ol className="learning-lessons flex flex-col" data-guide="learn-lessons">
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
