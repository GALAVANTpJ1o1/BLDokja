"use client";

import type { Voice } from "@bld/storage";
import { CheckIcon, CircleIcon, CaretRightIcon } from "@phosphor-icons/react";
import { VOICES } from "@bld/storage/options";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { TransitionLink } from "@/components/transitions/transition-link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { TransmissionWindow } from "@/components/ui/transmission-window";
import type { LessonFrontmatter } from "@/content/lessons/schema";
import { en } from "@/i18n/en";
import { voiced } from "@/i18n/voiced";
import { polish } from "@/i18n/polish";
import { GATE_B_BUFFERS, ReaderOverridesContext, type ReaderOverrides } from "@/lib/reader-context";
import { newId, nowIso } from "@/lib/ids";
import { loadStorage } from "@/lib/storage-lazy";
import { LessonMetaContext } from "./lesson-meta";
import { lessonDone, useLessonProgress } from "./use-progress";
import { LessonVoiceContext } from "./use-voice";

export interface LessonSummary {
  readonly id: string;
  readonly title: string;
  readonly track: string;
  readonly checkpoints: readonly string[];
}

/**
 * A lesson page: header, the short recap, the body in the chosen voice, and links along the path.
 * Only the chosen voice is mounted. A first-time visitor is asked which voice they want (your
 * 2026-09-15 answer); until then the plain voice shows.
 */
export function LessonView({ frontmatter, variants, lessons }: { frontmatter: LessonFrontmatter; variants: Partial<Record<Voice, ReactNode>>; lessons: readonly LessonSummary[] }) {
  const { settings, stored, ready, update } = useSettings();
  const overrides = useMemo<ReaderOverrides>(() => (frontmatter.lettering === "speffz" ? { buffers: "standard", lettering: "speffz" } : { buffers: "standard" }), [frontmatter.lettering]);
  const ownBuffers = stored?.buffers;
  const buffersDiffer =
    frontmatter.track !== "cfop" && ownBuffers !== undefined &&
    (["op", "m2", "threeStyle"] as const).some((m) => {
      const own = ownBuffers[m];
      return own !== undefined && (own.corners !== GATE_B_BUFFERS[m].corners || own.edges !== GATE_B_BUFFERS[m].edges);
    });
  const progress = useLessonProgress();
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const available = VOICES.filter((v) => variants[v] !== undefined);
  const chosen = settings.voice !== undefined && variants[settings.voice] !== undefined ? settings.voice : "plain";
  const body = useRef<HTMLDivElement>(null);
  const [contents, setContents] = useState<{ id: string; title: string }[]>([]);
  const positions = useRef(stored?.lessonPositions ?? {});
  useEffect(() => { positions.current = stored?.lessonPositions ?? {}; }, [stored?.lessonPositions]);
  useEffect(() => {
    const headings = Array.from(body.current?.querySelectorAll("h2,h3") ?? []);
    const items = headings.map((heading, index) => {
      heading.id ||= `section-${index + 1}`;
      return { id: heading.id, title: heading.textContent };
    });
    setContents(items);
    if (!ready || typeof IntersectionObserver === "undefined") return;
    let navigated = false;
    const onScroll = () => { navigated = true; };
    window.addEventListener("scroll", onScroll, { passive: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.find((e) => e.isIntersecting);
      if (entry === undefined) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Loading the top of an old lesson must not erase its saved resume point.
        if (!navigated && positions.current[frontmatter.id] !== undefined) return;
        const next = { ...positions.current, [frontmatter.id]: entry.target.id };
        positions.current = next;
        void update({ lessonPositions: next }).catch(() => undefined);
      }, 800);
    }, { rootMargin: "-5% 0px -70% 0px" });
    headings.forEach((heading) => { observer.observe(heading); });
    return () => { observer.disconnect(); clearTimeout(timer); window.removeEventListener("scroll", onScroll); };
  }, [chosen, frontmatter.id, update, ready]);

  useEffect(() => {
    void loadStorage().then((storage) => storage.appendEvents([{ id: newId(), type: "lesson.opened", at: nowIso(), lessonId: frontmatter.id }])).catch(() => undefined);
  }, [frontmatter.id]);

  const byId = new Map(lessons.map((l) => [l.id, l]));
  const missing = frontmatter.prerequisites.filter((p) => {
    const lesson = byId.get(p);
    return lesson !== undefined && progress !== undefined && !lessonDone(progress, p, lesson.checkpoints);
  });
  const track = lessons.filter((l) => l.track === frontmatter.track);
  const next = track[track.findIndex((l) => l.id === frontmatter.id) + 1];

  return (
    <ReaderOverridesContext.Provider value={overrides}>
    <LessonMetaContext.Provider value={{ lessonId: frontmatter.id, checkpoints: frontmatter.checkpoints }}>
      <LessonVoiceContext.Provider value={chosen}>
        <article className="lesson-article flex flex-col gap-8">
          <header className="lesson-header flex flex-col gap-3">
            <Breadcrumbs trail={[{ label: en.nav.learn, href: "/learn/" }, { label: frontmatter.title, href: `/learn/${frontmatter.id}/` }]} />
            <p className="t-meta text-quiet">{frontmatter.order}. · {en.lesson.minutes(frontmatter.estimatedMinutes)}</p>
            <h1 className="t-title">{frontmatter.title}</h1>
            {stored?.lessonPositions?.[frontmatter.id] !== undefined ? <a className="text-link self-start t-meta" href={`#${stored.lessonPositions[frontmatter.id]}`}>{polish.lesson.resume}</a> : null}
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
            <details className="quiet-disclosure">
              <summary>{polish.lesson.overview}</summary>
              <ul className="ml-5 list-disc t-body">
                {frontmatter.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </details>
          </header>

          {frontmatter.prerequisites.length > 0 ? (
            // Always rendered, at the same size, so it can't push the lesson down when your progress loads:
            // only the marks beside each lesson change.
            <p className={`t-body border-l-2 pl-3 ${missing.length > 0 ? "border-text" : "border-rule"}`}>
              {en.learn.prerequisites}:{" "}
              {frontmatter.prerequisites.map((id, i) => {
                const done = progress !== undefined && !missing.includes(id);
                return (
                  <span key={id}>
                    {i > 0 ? ", " : ""}
                    <TransitionLink href={`/learn/${id}/`}>{byId.get(id)?.title ?? id}</TransitionLink>
                    <span className="ml-1 inline-block w-[1.1em] text-center" aria-label={progress === undefined ? undefined : done ? en.lesson.prerequisiteDone : en.lesson.prerequisiteNotDone}>
                      {progress === undefined ? null : done ? <CheckIcon size={14} aria-hidden /> : <CircleIcon size={8} aria-hidden />}
                    </span>
                  </span>
                );
              })}
            </p>
          ) : null}

          {frontmatter.recap.length > 0 ? (
            <details className="quiet-disclosure" aria-label={en.lesson.recap}>
              <summary>{en.lesson.recap}</summary>
              <ul className="ml-5 list-disc t-body">
                {frontmatter.recap.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          ) : null}

          {buffersDiffer || (frontmatter.lettering === "speffz" && stored?.scheme !== undefined) ? (
            <div className="status-line t-ui">
              <p className="font-[650]">{polish.lesson.convention}</p>
              {buffersDiffer ? <><p>{polish.lesson.custom}</p><p className="t-notation">{Object.entries(GATE_B_BUFFERS).map(([method, b]) => `${method}: ${b.corners}/${b.edges}`).join("; ")}</p><TransitionLink href="/settings/lettering/">{polish.lesson.settings}</TransitionLink></> : null}
              {buffersDiffer && frontmatter.lettering === "speffz" && stored?.scheme !== undefined ? " " : null}
              {frontmatter.lettering === "speffz" && stored?.scheme !== undefined ? en.lesson.speffzHere : null}
            </div>
          ) : null}

          <div className="lesson-with-toc">
            <div ref={body} className="lesson-body flex flex-col gap-5 t-body">{variants[chosen] ?? variants.plain}</div>
            <nav className="lesson-toc hidden xl:flex" aria-label={polish.lesson.contents}><h2 className="t-ui font-[650]">{polish.lesson.contents}</h2>{stored?.lessonPositions?.[frontmatter.id] !== undefined ? <a href={`#${stored.lessonPositions[frontmatter.id]}`}>{polish.lesson.resume}</a> : null}{contents.map((item) => <a key={item.id} href={`#${item.id}`}>{item.title}</a>)}</nav>
          </div>

          {next !== undefined ? (
            <nav className="lesson-next" aria-label={en.lesson.nextLesson}>
              <span className="t-meta text-quiet">{en.lesson.nextLesson}</span><TransitionLink href={`/learn/${next.id}/`}><span>{next.title}</span><CaretRightIcon size={20} aria-hidden /></TransitionLink>
            </nav>
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
    </ReaderOverridesContext.Provider>
  );
}
