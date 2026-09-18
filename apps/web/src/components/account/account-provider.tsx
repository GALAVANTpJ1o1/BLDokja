"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as accountLib from "@/lib/account";
import { accountsConfigured, getSupabase } from "@/lib/supabase-client";

/**
 * Storage's account-namespacing (storage-client.ts) loads lazily, the same "not in every page's
 * first download" reasoning as settings-provider.tsx.
 */
const storageClient = () => import("@/lib/storage-client");

interface AccountContextValue {
  /** False only while the very first session check is in flight. */
  readonly ready: boolean;
  /** Whether accounts are configured in this build at all (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY set). Guest mode works regardless. */
  readonly configured: boolean;
  readonly userId: string | undefined;
  readonly username: string | undefined;
  readonly signedIn: boolean;
  readonly signUp: typeof accountLib.signUp;
  readonly signIn: typeof accountLib.signIn;
  readonly signOut: () => Promise<void>;
  readonly changeUsername: typeof accountLib.changeUsername;
  readonly changePassword: typeof accountLib.changePassword;
  readonly regenerateRecoveryCode: typeof accountLib.regenerateRecoveryCode;
  readonly redeemRecoveryCode: typeof accountLib.redeemRecoveryCode;
  readonly setLeaderboardOptIn: typeof accountLib.setLeaderboardOptIn;
  readonly deleteAccount: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

/**
 * Sign-up needs to show the user their one-time recovery code (and, if they had guest data, a
 * migration summary) before the page reloads out from under that UI -- both happen in direct
 * response to the same sign-up call that also triggers this provider's own SIGNED_IN reload, so
 * without this, whichever finishes first wins, and losing that race would mean silently never
 * showing a recovery code the user can never see again. One-shot: consumed by the very next reload
 * decision, whichever event that ends up being.
 */
let deferReloadOnce = false;
export function deferNextAccountReload(): void {
  deferReloadOnce = true;
}

function extractSession(session: Session | null): { userId: string | undefined; username: string | undefined } {
  if (session === null) return { userId: undefined, username: undefined };
  const meta = session.user.user_metadata as { username?: unknown } | undefined;
  return { userId: session.user.id, username: typeof meta?.username === "string" ? meta.username : undefined };
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const configured = accountsConfigured();
  const [ready, setReady] = useState(!configured);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const supabase = getSupabase();

    // onAuthStateChange fires once immediately with the current session (event "INITIAL_SESSION"),
    // then again on every subsequent sign-in/out/refresh -- one subscription covers both the first
    // check and every later change, so there's no separate getSession() call to race against it.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const { userId: id, username: name } = extractSession(session);
      setUserId(id);
      setUsername(name);
      setReady(true);
      // setActiveAccount() is idempotent (a no-op if the id hasn't actually changed, e.g. a plain
      // token refresh), so calling it on every event rather than filtering by event type is safe --
      // it only ever reloads when the account genuinely switched.
      void storageClient().then((m) => {
        if (!m.setActiveAccount(id)) return;
        if (deferReloadOnce) {
          deferReloadOnce = false;
          return;
        }
        window.location.reload();
      });
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [configured]);

  const value = useMemo<AccountContextValue>(
    () => ({
      ready,
      configured,
      userId,
      username,
      signedIn: userId !== undefined,
      signUp: accountLib.signUp,
      signIn: accountLib.signIn,
      signOut: () => accountLib.signOut(),
      changeUsername: accountLib.changeUsername,
      changePassword: accountLib.changePassword,
      regenerateRecoveryCode: accountLib.regenerateRecoveryCode,
      redeemRecoveryCode: accountLib.redeemRecoveryCode,
      setLeaderboardOptIn: accountLib.setLeaderboardOptIn,
      deleteAccount: accountLib.deleteAccount,
    }),
    [ready, configured, userId, username],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (value === undefined) throw new Error("useAccount needs an AccountProvider");
  return value;
}
