"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { speak, stopSpeaking } from "@/lib/speech";
import { TrainerHeader } from "@/components/trainer/trainer-header";
import { TransmissionWindow } from "@/components/ui/transmission-window";
import { en } from "@/i18n/en";

export interface Shortcut {
  readonly keys: string;
  readonly action: string;
}

/**
 * The shell every trainer shares (BRIEF §7): a settings panel, the drill surface, the session summary,
 * and a link back to the lesson that teaches it. `?` lists the trainer's keyboard shortcuts.
 */
export function TrainerShell({ title, intro, lesson, settings, children, summary, shortcuts, announce }: { title: string; intro: string; lesson?: { href: string; title: string }; settings?: ReactNode; children: ReactNode; summary?: ReactNode; shortcuts: readonly Shortcut[]; announce?: string }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { settings: appearance, update } = useSettings();
  const readAloud = appearance.readAloud;

  // The drill's current prompt, spoken whenever it changes: the non-visual path through a trainer (BRIEF §10).
  useEffect(() => {
    if (readAloud && announce !== undefined) speak(announce);
  }, [announce, readAloud]);
  useEffect(() => stopSpeaking, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <TrainerHeader
        title={title}
        intro={intro}
        {...(lesson === undefined ? {} : { lesson })}
        onKeys={() => { setHelpOpen(true); }}
        readAloud={{
          on: readAloud,
          toggle: () => {
            if (readAloud) stopSpeaking();
            void update({ readAloud: !readAloud });
          },
        }}
      />
      {settings !== undefined ? (
        <details className="panel">
          <summary className="cursor-pointer px-4 py-3 t-ui">{en.trainer.settings}</summary>
          <div className="flex flex-col gap-4 border-t border-rule px-4 py-4">{settings}</div>
        </details>
      ) : null}
      {/* The drill keeps its space while the trainer loads, so the page doesn't jump when it arrives. */}
      <section aria-label={en.trainer.drill} className="min-h-[24rem]">{children}</section>
      {summary !== undefined ? <section aria-label={en.trainer.summary} className="border-t border-rule pt-4">{summary}</section> : null}
      <TransmissionWindow open={helpOpen} title={en.trainer.keysTitle} onClose={() => { setHelpOpen(false); }}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {shortcuts.map((s) => (
            <div key={s.keys} className="contents">
              <dt>
                <kbd className="t-notation rounded-[2px] border border-rule px-2">{s.keys}</kbd>
              </dt>
              <dd>{s.action}</dd>
            </div>
          ))}
          <dt>
            <kbd className="t-notation rounded-[2px] border border-rule px-2">?</kbd>
          </dt>
          <dd>{en.trainer.showKeys}</dd>
        </dl>
      </TransmissionWindow>
    </div>
  );
}

/** A labelled group of mutually exclusive buttons for trainer settings. */
export function Segmented<T extends string>({ label, options, labels, value, onChange }: { label: string; options: readonly T[]; labels: Readonly<Record<T, string>>; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="t-meta text-quiet">{label}</span>
      {options.map((option) => (
        <button key={option} type="button" className="btn min-h-10 px-3" aria-pressed={value === option} onClick={() => { onChange(option); }}>
          {labels[option]}
        </button>
      ))}
    </div>
  );
}
