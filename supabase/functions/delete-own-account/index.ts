// Deletes the caller's own account and everything synced (v2 §D: distinct from "delete local data
// on this device", which never touches this function at all).
//
// Self-deletion needs the service-role key (only auth.admin.deleteUser can remove an auth.users
// row), so this can't run in the browser. The user to delete is never a client-supplied id --
// that would let anyone delete anyone. Instead, the caller's own bearer token is verified through a
// second, anon-keyed Supabase client's auth.getUser(), which validates the JWT via GoTrue itself
// rather than this function trying to decode/verify it by hand; the resulting user id is the only
// one ever passed to admin.deleteUser().
//
// Deleting the auth.users row cascades to profiles, sync_events, sync_letter_pairs, sync_settings
// and monthly_points_archive via their existing FKs (the same cascade exercised manually and
// confirmed working in docs/DECISIONS.md D-060). Storage objects are NOT covered by that cascade --
// Postgres FKs don't reach into Storage -- so this function also removes the caller's
// letter-pair-images folder explicitly before deleting the user.
//
// Deployed and exercised live on 2026-09-18 (docs/DECISIONS.md D-063, D-065), including against a real
// uploaded image. The listing assumes Storage's list() marks folder-like entries with `id: null` and that
// paths nest exactly two levels deep (<user_id>/<pairId>/<imageId>, per D-056). Storage errors abort the
// deletion (added after that live run, in the D-069 security review) and have not been exercised live.
import { createClient } from "jsr:@supabase/supabase-js@2";

// Which pages a browser may call this from. Exact origins come from SITE_ORIGINS (or the defaults),
// plus two families that can't be listed exactly:
//   - any localhost/127.0.0.1 port. `pnpm dev` moves to 3001 whenever 3000 is taken, and the
//     hardcoded 3000 turned account deletion into a preflight failure for a whole e2e run before
//     anyone noticed (docs/DECISIONS.md D-071);
//   - preview deployments, which get a per-branch hostname under the project's own pages.dev
//     subdomain. Only this Cloudflare project can publish there -- unlike bare *.pages.dev, which
//     is every Cloudflare user's, and must never be matched.
// CORS is not what protects this function: every call is authorised by its own bearer token. This
// only decides which pages a browser will let read the reply.
const ALLOWED_ORIGINS = (Deno.env.get("SITE_ORIGINS") ?? "http://localhost:3000,https://bldokja.pages.dev")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const PREVIEW_HOST_SUFFIX = ".bldokja.pages.dev";

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
  return url.protocol === "https:" && url.hostname.endsWith(PREVIEW_HOST_SUFFIX);
}

function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin !== null && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method-not-allowed" }, 405, origin);

  const authHeader = req.headers.get("authorization");
  if (authHeader === null) return jsonResponse({ ok: false, error: "not-authenticated" }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // Confirmed live on the real project (2026-09-18, docs/DECISIONS.md D-063): both the legacy names
  // (SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) and the newer plural ones
  // (SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS) are auto-provisioned simultaneously. The legacy
  // names are checked first since they're what this project actually has; the plural fallbacks are
  // defensive in case that ever changes.
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";

  // Verifies the caller's JWT via GoTrue itself (a real network round trip, not a local decode),
  // exactly as the comment at the top of this file explains.
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || callerData.user === null) return jsonResponse({ ok: false, error: "not-authenticated" }, 401, origin);
  const userId = callerData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // A failed listing or removal must stop here, before the account is deleted: carrying on would
  // report success ("everything deleted, everywhere") while leaving the user's images behind, with
  // nothing left to authenticate a retry against. Failing leaves the account intact so they can retry.
  const bucket = admin.storage.from("letter-pair-images");
  const objectPaths: string[] = [];
  const { data: topLevel, error: listError } = await bucket.list(userId, { limit: 1000 });
  if (listError) return jsonResponse({ ok: false, error: "storage-cleanup-failed" }, 500, origin);
  for (const entry of topLevel) {
    const entryPath = `${userId}/${entry.name}`;
    if (entry.id === null) {
      // A folder (a pairId), not a file -- one more level down reaches the actual images.
      const { data: nested, error: nestedError } = await bucket.list(entryPath, { limit: 1000 });
      if (nestedError) return jsonResponse({ ok: false, error: "storage-cleanup-failed" }, 500, origin);
      for (const file of nested) objectPaths.push(`${entryPath}/${file.name}`);
    } else {
      objectPaths.push(entryPath);
    }
  }
  if (objectPaths.length > 0) {
    const { error: removeError } = await bucket.remove(objectPaths);
    if (removeError) return jsonResponse({ ok: false, error: "storage-cleanup-failed" }, 500, origin);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return jsonResponse({ ok: false, error: "delete-failed" }, 500, origin);

  return jsonResponse({ ok: true }, 200, origin);
});
