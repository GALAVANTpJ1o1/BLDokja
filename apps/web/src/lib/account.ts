import { z } from "zod";
import { sha256Hex } from "./hash";
import { getSupabase } from "./supabase-client";

export { sha256Hex };

/**
 * Account operations (v2 §D). Sign-in is by username, not email -- there is no email-delivery
 * channel on the free pages.dev origin (docs/DECISIONS.md D-054). Supabase Auth is still
 * email-shaped internally, so every operation here derives a synthetic, never-delivered address
 * deterministically from the username; nothing outside this file should construct that address.
 *
 * Kept framework-free (no React) so it's independently testable, mirroring how packages/storage
 * keeps its logic separate from the components that use it.
 */

export const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/;
/**
 * The same rule, written for an `<input pattern>` attribute. Browsers compile that attribute with
 * the `v` flag, which rejects the unescaped trailing `-` that is fine in the RegExp literal above:
 * Chrome threw "Invalid character in character class" on every render of the account page and then
 * ignored the attribute entirely, so the field accepted anything until the server refused it
 * (docs/DECISIONS.md D-071). Keep the two in step, and keep the backslash.
 */
export const USERNAME_INPUT_PATTERN = "[a-z0-9_\\-]{3,24}";
export const MIN_PASSWORD_LENGTH = 8;
/** Excludes 0/O/1/I/L: a recovery code is read and typed back by a human, not pasted from a manager. */
const RECOVERY_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const RECOVERY_CODE_LENGTH = 10;
const SYNTHETIC_EMAIL_DOMAIN = "accounts.bldokja.internal";

export type AccountErrorCode = "invalid-credentials" | "username-taken" | "username-format" | "weak-password" | "network" | "unknown";

export class AccountError extends Error {
  readonly code: AccountErrorCode;
  constructor(code: AccountErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AccountError";
    this.code = code;
  }
}

export function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(RECOVERY_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => RECOVERY_CODE_ALPHABET[b % RECOVERY_CODE_ALPHABET.length]).join("");
}


/**
 * Maps a Supabase error to a typed code the UI can show copy for. The exact shape of "duplicate
 * username" wasn't reachable to verify live in this environment (a fresh browser permission
 * prompt blocked it) -- GoTrue's documented behaviour for a duplicate email is
 * `error.code === "user_already_exists"` (current supabase-js), matched here, with a
 * message-substring fallback for the rarer race where two signups for the same username reach the
 * profiles.username unique constraint at the same instant. Verify this mapping once the sign-up
 * form exists and can be tested normally (submit the same username twice).
 */
function mapAuthError(error: unknown): AccountError {
  if (error instanceof AccountError) return error;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (code === "user_already_exists" || lower.includes("already registered") || lower.includes("profiles_username_key") || lower.includes("duplicate key")) return new AccountError("username-taken", message);
  if (code === "invalid_credentials" || lower.includes("invalid login credentials")) return new AccountError("invalid-credentials", message);
  if (code === "weak_password" || lower.includes("password")) return new AccountError("weak-password", message);
  if (lower.includes("fetch") || lower.includes("network")) return new AccountError("network", message);
  return new AccountError("unknown", message);
}

export interface SignUpResult {
  readonly userId: string;
  /** Shown once. Never recoverable after this call returns -- only its hash is stored. */
  readonly recoveryCode: string;
}

export async function signUp(username: string, password: string): Promise<SignUpResult> {
  if (!USERNAME_PATTERN.test(username)) throw new AccountError("username-format");
  if (password.length < MIN_PASSWORD_LENGTH) throw new AccountError("weak-password");
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({ email: usernameToEmail(username), password, options: { data: { username } } });
  if (error) throw mapAuthError(error);
  const userId = data.user?.id;
  if (userId === undefined) throw new AccountError("unknown", "sign-up succeeded but no user id was returned");

  const recoveryCode = generateRecoveryCode();
  const { error: recoveryError } = await supabase.rpc("set_recovery_code", { code_hash: await sha256Hex(recoveryCode) });
  // The account exists either way; a failed recovery-code save shouldn't block sign-up. It can be
  // regenerated later from account settings, so this is surfaced but not thrown.
  if (recoveryError) console.error("set_recovery_code failed after sign-up", recoveryError);

  // profiles.timezone defaults to 'UTC' (supabase/migrations/20260918100000_profiles.sql); without
  // this, every account's server-side streak leaderboard (leaderboard_streaks(), D-060) would
  // silently bucket days in UTC regardless of where the user actually is. Best-effort: a failure
  // here isn't worth blocking sign-up over, and the account still works correctly in every other
  // respect with the UTC default until this succeeds (on a later sign-in, say).
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { error: tzError } = await supabase.from("profiles").update({ timezone }).eq("id", userId);
    if (tzError) console.error("setting profiles.timezone failed after sign-up", tzError);
  } catch (err) {
    console.error("detecting the local timezone failed after sign-up", err);
  }

  return { userId, recoveryCode };
}

export async function signIn(username: string, password: string): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error) throw mapAuthError(error);

  // Kept in step on every sign-in, not just at sign-up: there is no manual "change timezone" UI yet
  // (a documented gap, not an oversight), so there is nothing a user-chosen value could be clobbering
  // by refreshing this automatically. Reconsider re-detecting unconditionally if that UI is ever
  // built -- at that point this should only fill in a *missing* value, not override a chosen one.
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await supabase.from("profiles").update({ timezone }).eq("id", data.user.id);
  } catch {
    // Best-effort: sign-in itself already succeeded and must not fail because of this.
  }
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

export async function currentUserId(): Promise<string | undefined> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id;
}

export async function currentUsername(): Promise<string | undefined> {
  const { data } = await getSupabase().auth.getUser();
  const raw = data.user?.user_metadata as { username?: unknown } | undefined;
  return typeof raw?.username === "string" ? raw.username : undefined;
}

/** Changes the login username. Updates the public profile first (unique constraint catches a collision before touching auth), then the synthetic auth email to match. */
export async function changeUsername(newUsername: string): Promise<void> {
  if (!USERNAME_PATTERN.test(newUsername)) throw new AccountError("username-format");
  const supabase = getSupabase();
  const userId = await currentUserId();
  if (userId === undefined) throw new AccountError("unknown", "not signed in");
  const { error: profileError } = await supabase.from("profiles").update({ username: newUsername.toLowerCase() }).eq("id", userId);
  if (profileError) throw mapAuthError(profileError);
  const { error: authError } = await supabase.auth.updateUser({ email: usernameToEmail(newUsername), data: { username: newUsername } });
  if (authError) throw mapAuthError(authError);
}

export async function changePassword(newPassword: string): Promise<void> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new AccountError("weak-password");
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw mapAuthError(error);
}

/** Regenerates the recovery code. The previous code stops working the moment this succeeds (set_recovery_code replaces the stored hash). */
export async function regenerateRecoveryCode(): Promise<string> {
  const recoveryCode = generateRecoveryCode();
  const { error } = await getSupabase().rpc("set_recovery_code", { code_hash: await sha256Hex(recoveryCode) });
  if (error) throw mapAuthError(error);
  return recoveryCode;
}

export interface RedeemRecoveryCodeResult {
  readonly ok: boolean;
  readonly error?: "invalid" | "locked" | "network";
}

/** Calls the redeem-recovery-code Edge Function -- the only path that can change a password without an existing session (docs/DECISIONS.md D-055). */
export async function redeemRecoveryCode(username: string, recoveryCode: string, newPassword: string): Promise<RedeemRecoveryCodeResult> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "invalid" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || anonKey === undefined) return { ok: false, error: "network" };
  try {
    const res = await fetch(`${url}/functions/v1/redeem-recovery-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ username, recoveryCode, newPassword }),
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (body.ok) return { ok: true };
    return { ok: false, error: body.error === "locked" ? "locked" : "invalid" };
  } catch {
    return { ok: false, error: "network" };
  }
}

export interface LeaderboardSettings {
  readonly optIn: boolean;
  readonly displayName: string;
}

const LeaderboardSettingsRowSchema = z.object({ leaderboard_opt_in: z.boolean(), display_name: z.string() });

/** The one place a `profiles` row becomes {@link LeaderboardSettings}; undefined when it isn't the shape the schema promises. */
export function parseLeaderboardSettings(row: unknown): LeaderboardSettings | undefined {
  const parsed = LeaderboardSettingsRowSchema.safeParse(row);
  return parsed.success ? { optIn: parsed.data.leaderboard_opt_in, displayName: parsed.data.display_name } : undefined;
}

/**
 * What the account's leaderboard settings currently are, so the form can show them before offering to
 * change them. undefined means "couldn't tell" (signed out, offline, unexpected shape) -- a form must
 * not fall back to guessing defaults, because saving guessed values overwrites the real ones.
 */
export async function getLeaderboardSettings(): Promise<LeaderboardSettings | undefined> {
  const userId = await currentUserId();
  if (userId === undefined) return undefined;
  const { data, error } = await getSupabase().from("profiles").select("leaderboard_opt_in, display_name").eq("id", userId).maybeSingle();
  if (error) return undefined;
  return parseLeaderboardSettings(data);
}

export async function setLeaderboardOptIn(optIn: boolean, displayName?: string): Promise<void> {
  const supabase = getSupabase();
  const userId = await currentUserId();
  if (userId === undefined) throw new AccountError("unknown", "not signed in");
  const patch: Record<string, unknown> = { leaderboard_opt_in: optIn };
  if (displayName !== undefined) patch.display_name = displayName;
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw mapAuthError(error);
}

/**
 * Deletes the signed-in user's own account and everything synced, everywhere (v2 §D: distinct from
 * "delete local data", which is a plain local storage.clearAll() and never calls this). Self-deletion
 * isn't possible with the anon/user session alone -- only the admin API can remove an auth.users
 * row -- so this calls supabase/functions/delete-own-account, which identifies who to delete from
 * the caller's own verified session, never a client-supplied id.
 */
export async function deleteAccount(): Promise<void> {
  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (accessToken === undefined) throw new AccountError("unknown", "not signed in");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || anonKey === undefined) throw new AccountError("network");
  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/delete-own-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new AccountError("network");
  }
  const body = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean };
  if (!body.ok) throw new AccountError("unknown", "account deletion failed");
  await supabase.auth.signOut();
}
