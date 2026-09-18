import type { Settings } from "@bld/storage";
import { currentAccountId, getStorage } from "@/lib/storage-client";
import { getSupabase } from "@/lib/supabase-client";

/**
 * Fields that never sync, even when signed in: they name a device capability, not an account fact
 * (v2 plan §C: "do not sync inherently device-specific capabilities... browser storage permissions,
 * ... device permission state"). Whether *this* browser was granted persistent storage says nothing
 * about any other device the account is used from.
 */
export const DEVICE_ONLY_SETTINGS_FIELDS: ReadonlySet<string> = new Set(["persistentStorage"]);

export interface SettingsSyncClient {
  rpc(fn: "merge_settings", args: { patch: Record<string, unknown>; patch_times: Record<string, string> }): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface SyncSettingsResult {
  readonly synced: boolean;
  readonly failed: boolean;
}

/**
 * Pushes any locally-changed settings fields (those with a syncFieldUpdatedAt stamp -- see
 * settings-provider.tsx's update(), the one exclusive write path for local settings) and applies the
 * server's per-field-merged result back locally, in one round trip: merge_settings() (Postgres,
 * D-056/D-060) does the actual per-field newer-wins comparison server-side and returns the
 * authoritative merged object either way, even for an empty patch -- so this doubles as a "pull" too.
 *
 * The merged result is spread onto the existing local record, never replacing it outright: the
 * server only ever knows about fields that have been pushed at least once (nothing else is in its
 * `data` column), so a field this device has never synced -- pre-existing guest settings from before
 * an account existed, for instance -- would otherwise be wiped out by a wholesale overwrite.
 */
export async function syncSettings(client: SettingsSyncClient = getSupabase()): Promise<SyncSettingsResult> {
  const accountId = currentAccountId();
  if (accountId === undefined) return { synced: false, failed: false };

  const storage = getStorage();
  const local = (await storage.settings()) ?? {};
  const times = local.syncFieldUpdatedAt ?? {};

  const patch: Record<string, unknown> = {};
  const patchTimes: Record<string, string> = {};
  for (const [key, value] of Object.entries(local)) {
    if (key === "syncFieldUpdatedAt" || DEVICE_ONLY_SETTINGS_FIELDS.has(key)) continue;
    const at = times[key];
    if (at !== undefined) {
      patch[key] = value;
      patchTimes[key] = at;
    }
  }

  const { data, error } = await client.rpc("merge_settings", { patch, patch_times: patchTimes });
  if (error || typeof data !== "object" || data === null) return { synced: false, failed: true };

  await storage.putSettings({ ...local, ...(data as Partial<Settings>) });
  return { synced: true, failed: false };
}
