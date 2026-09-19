import { z } from "zod";

/**
 * Which page guides this browser has already shown, and at which version of each, so a guide opens by
 * itself the first time you visit its page and never again. It lives in this browser's storage rather than
 * in your synced settings on purpose: whether you have been walked around a page is about this device.
 * A guide's version is bumped when its steps change enough to be worth showing again.
 */
const KEY = "bld.guides.seen";
const SeenSchema = z.record(z.string(), z.number().int().nonnegative());
export type SeenGuides = z.infer<typeof SeenSchema>;

export interface GuideStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Kept for the life of the page too, so a browser that refuses storage (a private window, say) still
// shows each guide once instead of reopening it on every visit to the page.
const remembered = new Map<string, number>();

function browserStorage(): GuideStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Everything seen so far. Anything in storage that isn't the shape written here is ignored, not trusted. */
export function readSeen(storage: GuideStorage | undefined = browserStorage()): SeenGuides {
  const seen: Record<string, number> = {};
  try {
    const raw = storage === undefined ? null : storage.getItem(KEY);
    if (raw !== null) {
      const parsed = SeenSchema.safeParse(JSON.parse(raw));
      if (parsed.success) Object.assign(seen, parsed.data);
    }
  } catch {
    // Unreadable or not JSON: treated as nothing seen.
  }
  for (const [id, version] of remembered) seen[id] = Math.max(seen[id] ?? 0, version);
  return seen;
}

/** The id that stands for every guide at once: `{"*": 1}` says all of them have been seen. */
export const ALL_GUIDES = "*";

export function hasSeen(id: string, version: number, storage?: GuideStorage): boolean {
  const seen = readSeen(storage);
  return Math.max(seen[id] ?? 0, seen[ALL_GUIDES] ?? 0) >= version;
}

export function markSeen(id: string, version: number, storage: GuideStorage | undefined = browserStorage()): void {
  remembered.set(id, Math.max(remembered.get(id) ?? 0, version));
  try {
    const seen = readSeen(storage);
    // Never written lower than what is already recorded, or an older mark would bring a newer guide back.
    storage?.setItem(KEY, JSON.stringify({ ...seen, [id]: Math.max(seen[id] ?? 0, version) }));
  } catch {
    // Storage full or blocked: the in-page record above still holds.
  }
}

/** For tests: forget what this page load remembered. */
export function forgetRemembered(): void {
  remembered.clear();
}
