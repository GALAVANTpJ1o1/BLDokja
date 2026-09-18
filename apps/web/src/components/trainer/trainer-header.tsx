"use client";

import { LoadingCube } from "@/components/cube/loading-cube";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";

export interface TrainerHeading {
  readonly title: string;
  readonly intro: string;
  readonly lesson?: { readonly href: string; readonly title: string };
}

/**
 * A trainer's header: where it sits, the lesson that teaches it, its title and intro, and the Keys button.
 * Trainers render in the browser only, so their loaders show this same header in the static HTML while the
 * trainer loads (without `onKeys` and `readAloud`, their buttons are disabled). The text then paints with the page instead of
 * seconds later, and nothing moves when the trainer arrives.
 */
export function TrainerHeader({ title, intro, lesson, onKeys, readAloud }: TrainerHeading & { readonly onKeys?: () => void; readonly readAloud?: { readonly on: boolean; readonly toggle: () => void } }) {
  return (
    <header className="trainer-header flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <p className="t-meta text-quiet">
          <TransitionLink href="/practice/">{en.nav.practice}</TransitionLink>
          {lesson !== undefined ? (
            <>
              {" · "}
              {en.trainer.learnIn} <TransitionLink href={lesson.href}>{lesson.title}</TransitionLink>
            </>
          ) : null}
        </p>
        <h1 className="t-title">{title}</h1>
        <p className="t-body prose-measure text-quiet">{intro}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Rendered disabled while loading too, so the header wraps the same way before and after. */}
        <button type="button" className="btn" aria-pressed={readAloud?.on ?? false} onClick={readAloud?.toggle} disabled={readAloud === undefined}>
          {en.trainer.readAloud}
        </button>
        <button type="button" className="btn" onClick={onKeys} disabled={onKeys === undefined} aria-keyshortcuts="?">
          {en.trainer.keys}
        </button>
      </div>
    </header>
  );
}

/** What a trainer's loader shows until the trainer is ready: the real header and a quiet loading line. */
export function TrainerLoading({ message, ...heading }: TrainerHeading & { readonly message: string }) {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <TrainerHeader {...heading} />
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-4">
        <LoadingCube />
        <p className="t-meta text-quiet" role="status">{message}</p>
      </div>
    </div>
  );
}
