"use client";

import { VOICES, type Voice } from "@bld/storage";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { TransitionLink } from "@/components/transitions/transition-link";
import { TransmissionWindow } from "@/components/ui/transmission-window";
import type { LessonFrontmatter } from "@/content/lessons/schema";
import { en } from "@/i18n/en";
import { voiced } from "@/i18n/voiced";
import { getStorage, newId, nowIso } from "@/lib/storage-client";
import { LessonMetaContext } from "./lesson-meta";
import { lessonDone, useLessonProgress } from "./use-progress";
import { LessonVoiceContext } from "./use-voice";

export interface LessonSummary {
  readonly id: string;
  readonly title: string;
  readonly checkpoints: readonly string[];
}

/**
 * A lesson page: header, the short recap, the body in the chosen voice, and links along the path.
 * Only the chosen voice is mounted. A first-time visitor is asked which voice they want (your
 * 2026-09-15 answer); until then the plain voice shows.
 */
export function LessonView({ frontmatter, variants, lessons }: { frontmatter: LessonFrontmatter; variants: Partial<Record<Voice, ReactNode>>; lessons: readonly LessonSummary[] }) {
  const { settings, ready, update } = useSettings();
  const progress = useLessonProgress();
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const available = VOICES.filter((v) => variants[v] !== undefined);
  const chosen = settings.voice !== undefined && variants[settings.voice] !== undefined ? settings.voice : "plain";

  useEffect(() => {
    void getStorage().appendEvents([{ id: newId(), type: "lesson.opened", at: nowIso(), lessonId: frontmatter.id }]);
  }, [frontmatter.id]);

  const byId = new Map(lessons.map((l) => [l.id, l]));
  const missing = frontmatter.prerequisites.filter((p) => {
    const lesson = byId.get(p);
    return lesson !== undefined && progress !== undefined && !lessonDone(progress, p, lesson.checkpoints);
  });
  const position = lessons.findIndex((l) => l.id === frontmatter.id);
  const next = lessons[position + 1];

  return (
    <LessonMetaContext.Provider value={{ lessonId: frontmatter.id, checkpoints: frontmatter.checkpoints }}>
      <LessonVoiceContext.Provider value={chosen}>
        <article className="flex max-w-3xl flex-col gap-6">
          <header className="flex flex-col gap-3">
            <p className="t-meta text-quiet">
              <TransitionLink href="/learn/">{en.lesson.backToPath}</TransitionLink> · {frontmatter.order}. · {en.lesson.minutes(frontmatter.estimatedMinutes)}
            </p>
            <h1 className="t-title">{frontmatter.title}</h1>
            {available.length > 1 ? (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label={en.lesson.voice}>
                <span className="t-meta text-quiet">{en.lesson.voice}</span>
                {available.map((v) => (
                  <button key={v} type="button" className="btn min-h-9 px-3 t-meta" aria-pressed={chosen === v} onClick={() => void update({ voice: v })}>
                    {en.settings.voices[v]}
                  </button>
                ))}
              </div>
            ) : null}
            <div>
              <h2 className="t-subheading">{en.lesson.objectives}</h2>
              <ul className="ml-5 list-disc t-body">
                {frontmatter.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          </header>

          {missing.length > 0 ? (
            <p className="t-body border-l-2 border-text pl-3">
              {en.lesson.prerequisitesMissing}{" "}
              {missing.map((id, i) => (
                <span key={id}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/learn/${id}/`}>{byId.get(id)?.title ?? id}</Link>
                </span>
              ))}
            </p>
          ) : null}

          {frontmatter.recap.length > 0 ? (
            <section className="border-y border-rule py-4" aria-label={en.lesson.recap}>
              <h2 className="t-subheading">{en.lesson.recap}</h2>
              <ul className="ml-5 list-disc t-body">
                {frontmatter.recap.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="lesson-body prose-measure flex flex-col gap-4 t-body">{variants[chosen] ?? variants.plain}</div>

          {next !== undefined ? (
            <p className="border-t border-rule pt-4 t-body">
              {en.lesson.nextLesson}: <TransitionLink href={`/learn/${next.id}/`}>{next.title}</TransitionLink>
            </p>
          ) : null}
        </article>

        <TransmissionWindow open={ready && settings.voice === undefined && !pickerDismissed} title={voiced.pickerTitle} onClose={() => { setPickerDismissed(true); }}>
          <p>{voiced.pickerIntro}</p>
          <div className="flex flex-col gap-3">
            {VOICES.map((v) => (
              <button key={v} type="button" className="flex flex-col items-start gap-1 rounded-none border border-rule p-3 text-left hover:bg-stage" onClick={() => void update({ voice: v })}>
                <span className="t-ui font-[650]">{en.settings.voices[v]}</span>
                <span className="t-meta text-quiet">{voiced.samples[v]()}</span>
              </button>
            ))}
          </div>
        </TransmissionWindow>
      </LessonVoiceContext.Provider>
    </LessonMetaContext.Provider>
  );
}
