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

export function localVoice(): SpeechSynthesisVoice | undefined {
  if (!speechAvailable()) return undefined;
  return window.speechSynthesis.getVoices().find((voice) => voice.localService && /^en(?:-|$)/i.test(voice.lang));
}

export function speak(text: string, onError?: () => void): void {
  if (!speechAvailable() || text.trim() === "") return;
  const voice = localVoice();
  if (voice === undefined) { onError?.(); return; }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.onerror = (event) => { if (event.error !== "canceled" && event.error !== "interrupted") onError?.(); };
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
    (listener) => {
      if (!speechAvailable()) return () => undefined;
      window.speechSynthesis.addEventListener("voiceschanged", listener);
      return () => { window.speechSynthesis.removeEventListener("voiceschanged", listener); };
    },
    () => localVoice() !== undefined,
    () => false,
  );
}
