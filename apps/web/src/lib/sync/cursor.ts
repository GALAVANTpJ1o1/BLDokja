import { currentAccountId } from "@/lib/storage-client";

/**
 * The local pull cursor for one account's event sync (v2 §F: "incremental pull cursors"). Kept in
 * localStorage, not in the synced storage itself -- a pull cursor is exactly the kind of
 * device-specific fact the plan says never to sync (v2 §C): it names how far *this device* has
 * caught up, not anything about the account. Namespaced by account id so switching accounts (or
 * signing into the same account on a different device that shares this browser) never reads the
 * wrong device's progress.
 */
function cursorKey(accountId: string): string {
  return `bld.sync.cursor.${accountId}`;
}

export function getSyncCursor(): number {
  const accountId = currentAccountId();
  if (accountId === undefined) return 0;
  try {
    const raw = localStorage.getItem(cursorKey(accountId));
    if (raw === null) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function setSyncCursor(serverSeq: number): void {
  const accountId = currentAccountId();
  if (accountId === undefined) return;
  try {
    localStorage.setItem(cursorKey(accountId), String(serverSeq));
  } catch {
    // Blocked storage: the next pull just starts from 0 again. Re-fetching everything is wasteful
    // but not wrong -- appendEvents() is id-idempotent, so nothing is duplicated or lost.
  }
}
