import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The one Supabase client the app uses, loaded on first use (accounts.ts imports this lazily, the
 * same "not in every page's first download" reasoning as storage-lazy.ts). Auth-only in v2 M3: no
 * table access happens through this client yet beyond what auth needs (the profiles row a session
 * implies). NEXT_PUBLIC_* values are safe to expose (docs/DEPLOY.md) -- RLS is what actually protects
 * data, not keeping the anon key secret.
 */
let instance: SupabaseClient | undefined;

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set");
    this.name = "SupabaseNotConfiguredError";
  }
}

export function getSupabase(): SupabaseClient {
  if (instance === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url === undefined || url.length === 0 || anonKey === undefined || anonKey.length === 0) throw new SupabaseNotConfiguredError();
    instance = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return instance;
}

/** Whether accounts are configured at all in this build. Guest mode never needs this to be true. */
export function accountsConfigured(): boolean {
  return typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" && process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 && typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;
}
