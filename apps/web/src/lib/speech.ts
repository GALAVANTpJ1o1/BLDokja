"use client";

import { useSyncExternalStore } from "react";

/**
 * Reading prompts aloud (BRIEF §10: every trainer needs a non-visual path). The browser's own speech
 * synthesis: nothing is sent anywhere, and it works offline wherever the device has a voice installed.
 * Each announcement replaces the one before it, so a fast drill doesn't queue up a backlog.
 */
export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
}

export function speak(text: string): void {
  if (!speechAvailable() || text.trim() === "") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}

/**
 * One line for a drill prompt: the parts that are present, joined so a voice pauses between them.
 * Notation is spelled out letter by letter ("R U R prime"), which is how a solver would say it.
 */
export function announcement(parts: readonly (string | undefined)[]): string {
  return parts.filter((part): part is string => part !== undefined && part.trim() !== "").join(". ");
}

/** Whether this browser can speak, as React state. Server rendering assumes it can't, so nothing claims it before hydration. */
export function useSpeechAvailable(): boolean {
  return useSyncExternalStore(
    () => () => {
      // Voices can load late, but whether speech exists at all doesn't change.
    },
    speechAvailable,
    () => false,
  );
}
