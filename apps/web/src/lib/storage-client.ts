"use client";

import { createStorage, memoryBackend, type StorageAdapter } from "@bld/storage";
import { dexieBackend } from "@bld/storage/dexie";

/**
 * The one StorageAdapter the app uses. IndexedDB when the browser has it; otherwise an in-memory
 * store, so the site still works (without keeping anything) where storage is blocked.
 */
let instance: StorageAdapter | undefined;
let persistent = false;

export function getStorage(): StorageAdapter {
  if (instance === undefined) {
    const hasIndexedDb = typeof indexedDB !== "undefined";
    persistent = hasIndexedDb;
    instance = createStorage(hasIndexedDb ? dexieBackend() : memoryBackend());
  }
  return instance;
}

export function storageIsPersistent(): boolean {
  getStorage();
  return persistent;
}

/** Asks the browser not to evict this site's data (BRIEF §12, your 2026-09-15 answer). */
export async function requestPersistentStorage(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof navigator === "undefined" || !("storage" in navigator) || typeof navigator.storage.persist !== "function") return "unsupported";
  try {
    if (await navigator.storage.persisted()) return "granted";
    return (await navigator.storage.persist()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

export { newId, nowIso } from "./ids";
