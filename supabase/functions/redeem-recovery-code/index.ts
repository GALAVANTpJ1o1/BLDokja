// Redeems a one-time recovery code for a password reset, standing in for the
// email-based "forgot password" link this project can't send (no email-delivery
// channel on the free pages.dev origin -- see docs/DECISIONS.md).
//
// This is the one place in the whole v2 design that touches auth.admin.updateUserById,
// which needs the service_role key and therefore can only run here (an Edge Function),
// never in the browser and never as a plain Postgres function -- directly writing
// auth.users.encrypted_password from SQL would bypass GoTrue's own password handling and
// session invalidation, which the admin API is the documented, supported way to avoid.
// Verified against current Supabase docs (2026-09-18): supabase.com/docs/reference/javascript/auth-admin-updateuserbyid.
//
// Deployed to the real project on 2026-09-18 with --no-verify-jwt: this must be callable
// with no session at all (that's the whole point -- someone locked out is trying to get
// back in), and this project's anon/publishable key is not a JWT (docs/DECISIONS.md D-063),
// so Supabase's platform-level JWT check would otherwise reject the call before it ever
// reached this code. delete-own-account keeps the default (JWT required), since it's
// always called with a real signed-in session's access token. Still not exercised
// end-to-end with an actual wrong/right recovery code through this deployed copy --
// verify that once the sign-up/forgot-password UI can drive it for real.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("SITE_ORIGINS") ?? "http://localhost:3000,https://bldokja.pages.dev")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;

function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin !== null && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time-ish comparison so a mismatch doesn't leak how many leading characters
// were correct via a fast-exit string compare.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface RedeemRequest {
  readonly username: unknown;
  readonly recoveryCode: unknown;
  readonly newPassword: unknown;
}

function parseRequest(body: unknown): { username: string; recoveryCode: string; newPassword: string } | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { username, recoveryCode, newPassword } = body as RedeemRequest;
  if (typeof username !== "string" || typeof recoveryCode !== "string" || typeof newPassword !== "string") return undefined;
  if (username.length === 0 || recoveryCode.length === 0) return undefined;
  if (newPassword.length < MIN_PASSWORD_LENGTH) return undefined;
  return { username: username.toLowerCase().trim(), recoveryCode: recoveryCode.toUpperCase().trim(), newPassword };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method-not-allowed" }, 405, origin);

  let parsed;
  try {
    parsed = parseRequest(await req.json());
  } catch {
    parsed = undefined;
  }
  if (parsed === undefined) return jsonResponse({ ok: false, error: "invalid-request" }, 400, origin);
  const { username, recoveryCode, newPassword } = parsed;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // Confirmed live on the real project (2026-09-18, docs/DECISIONS.md D-063): both the legacy
  // SUPABASE_SERVICE_ROLE_KEY and the newer, plural SUPABASE_SECRET_KEYS are auto-provisioned
  // simultaneously. The legacy name is checked first since it's what this project actually has.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: profile } = await supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle();

  const providedHash = await sha256Hex(recoveryCode);

  if (profile === null) {
    // No such username: still hash the input so this branch takes roughly the same time
    // as a real lookup, and return the same generic error either way -- never reveal
    // whether a username exists.
    return jsonResponse({ ok: false, error: "invalid" }, 400, origin);
  }

  const { data: recovery } = await supabaseAdmin
    .from("account_recovery")
    .select("code_hash, used_at, failed_attempts")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (recovery === null || recovery.used_at !== null || recovery.failed_attempts >= MAX_FAILED_ATTEMPTS) {
    return jsonResponse({ ok: false, error: recovery !== null && recovery.failed_attempts >= MAX_FAILED_ATTEMPTS ? "locked" : "invalid" }, 400, origin);
  }

  if (!timingSafeEqual(providedHash, recovery.code_hash)) {
    await supabaseAdmin
      .from("account_recovery")
      .update({ failed_attempts: recovery.failed_attempts + 1 })
      .eq("user_id", profile.id);
    return jsonResponse({ ok: false, error: "invalid" }, 400, origin);
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, { password: newPassword });
  if (updateError) return jsonResponse({ ok: false, error: "update-failed" }, 500, origin);

  await supabaseAdmin
    .from("account_recovery")
    .update({ used_at: new Date().toISOString(), failed_attempts: 0 })
    .eq("user_id", profile.id);

  return jsonResponse({ ok: true }, 200, origin);
});
