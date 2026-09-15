"use client";

import type { StorageAdapter } from "@bld/storage";

/**
 * The app's StorageAdapter, loaded on first use. Components on content pages (the shell, the learning path,
 * lessons, home) only touch storage after the page has painted, so they load Dexie then instead of in
 * every page's first download. Trainers import `storage-client` directly; they're loaded on demand anyway.
 */
export function loadStorage(): Promise<StorageAdapter> {
  return import("./storage-client").then((m) => m.getStorage());
}
