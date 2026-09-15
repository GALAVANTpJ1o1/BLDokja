"use client";

import type { Voice } from "@bld/storage";
import { createContext, useContext } from "react";
import { useSettings } from "@/components/settings/settings-provider";

/** The voice a lesson is showing (it can differ from settings while the reader previews one). */
export const LessonVoiceContext = createContext<Voice | undefined>(undefined);

export function useVoice(): Voice {
  const lesson = useContext(LessonVoiceContext);
  const { settings } = useSettings();
  return lesson ?? settings.voice ?? "plain";
}
