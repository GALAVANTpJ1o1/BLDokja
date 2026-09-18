"use client";

import { createStorage, memoryBackend, type Backend, type StorageAdapter } from "@bld/storage";
import { dexieBackend } from "@bld/storage/dexie";

/**
 * The one StorageAdapter the app uses. IndexedDB when the browser has it; otherwise an in-memory
 * store, so the site still works (without keeping anything) where storage is blocked.
 *
 * Guests always use the original, unnamespaced "bldokja" database (accountId undefined) -- every
 * existing v1 install keeps reading its own data untouched. A signed-in session gets a separate,
 * account-namespaced database instead, so switching accounts (or back to guest) on the same browser
 * never mixes data (v2 plan §D).
 *
 * The active account id is mirrored into localStorage (synchronous, available the instant this
 * module loads) rather than only held in memory. Without that, the first getStorage() call on a
 * fresh page load -- which can come from any provider, in any order -- would have no way to know a
 * signed-in session exists yet (AccountProvider's own session check is necessarily async, via
 * Supabase), and could open the wrong database before AccountProvider had a chance to say
 * otherwise. Reading it synchronously here removes that race instead of trying to win it.
 *
 * AccountProvider calls setActiveAccount() on sign-in/sign-out/switch, then reloads the page so
 * every already-mounted component re-derives its state against the (now correctly named) storage
 * instance -- nothing else should call setActiveAccount().
 */
let instance: StorageAdapter | undefined;
/** memoryBackend() has no close(); dexieBackend()'s does. Typed as plain Backend and checked at the one call site, rather than a `{close?}` shape TS treats as unsatisfiable by memoryBackend()'s Backend (which shares no property with it at all). */
let currentBackend: Backend | undefined;
let persistent = false;

const ACTIVE_ACCOUNT_KEY = "bld.activeAccountId";

function readPersistedAccountId(): string | undefined {
  try {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writePersistedAccountId(accountId: string | undefined): void {
  try {
    if (accountId === undefined) localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    else localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
  } catch {
    // Storage blocked: this tab falls back to guest naming until AccountProvider corrects it.
  }
}

let activeAccountId: string | undefined = typeof localStorage === "undefined" ? undefined : readPersistedAccountId();

function dbNameFor(accountId: string | undefined): string {
  return accountId === undefined ? "bldokja" : `bldokja::account::${accountId}`;
}

function hasClose(backend: Backend): backend is Backend & { close: () => void } {
  return "close" in backend && typeof (backend as { close?: unknown }).close === "function";
}

export function getStorage(): StorageAdapter {
  if (instance === undefined) {
    const hasIndexedDb = typeof indexedDB !== "undefined";
    persistent = hasIndexedDb;
    const backend = hasIndexedDb ? dexieBackend(dbNameFor(activeAccountId)) : memoryBackend();
    currentBackend = backend;
    instance = createStorage(backend);
  }
  return instance;
}

/** The Dexie database name getStorage() currently serves, without opening it. For diagnostics/tests. */
export function activeStorageName(): string {
  return dbNameFor(activeAccountId);
}

/** The signed-in account id storage is currently namespaced by, or undefined for a guest. The sync engine uses this to decide whether there's anything to sync at all. */
export function currentAccountId(): string | undefined {
  return activeAccountId;
}

/** Returns true if this actually switched the active account (so the caller knows whether a reload is needed), false for a no-op call with the account unchanged. */
export function setActiveAccount(accountId: string | undefined): boolean {
  if (accountId === activeAccountId) return false;
  activeAccountId = accountId;
  writePersistedAccountId(accountId);
  if (currentBackend !== undefined && hasClose(currentBackend)) currentBackend.close();
  currentBackend = undefined;
  instance = undefined;
  return true;
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
