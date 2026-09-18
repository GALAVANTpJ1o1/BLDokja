// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useReducer } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountView } from "./account-view";

/**
 * Regression: a successful sign-up flips `signedIn` to true before the recovery code has been shown.
 * When the flow's state lived inside SignedOutView, that flip unmounted the component holding it, so a
 * new user was signed in without ever seeing their one-time recovery code (found by the first real
 * e2e run, docs/DECISIONS.md D-070).
 */
let signedIn = false;
const rerenders = new Set<() => void>();

vi.mock("@/components/account/account-provider", () => ({
  deferNextAccountReload: vi.fn(),
  useAccount: () => ({
    ready: true,
    configured: true,
    signedIn,
    username: signedIn ? "ana" : undefined,
    signUp: () => {
      signedIn = true; // the auth state change lands before the sign-up call returns to the form
      rerenders.forEach((rerender) => { rerender(); });
      return Promise.resolve({ userId: "u1", recoveryCode: "ABCDEFGHJK" });
    },
    signIn: () => {
      signedIn = true;
      rerenders.forEach((rerender) => { rerender(); });
      return Promise.resolve();
    },
    signOut: () => Promise.resolve(),
    changeUsername: () => Promise.resolve(),
    changePassword: () => Promise.resolve(),
    regenerateRecoveryCode: () => Promise.resolve("X"),
    redeemRecoveryCode: () => Promise.resolve({ ok: true }),
    setLeaderboardOptIn: () => Promise.resolve(),
    deleteAccount: () => Promise.resolve(),
  }),
}));
vi.mock("@/components/account/post-auth-flow", () => ({
  PostAuthFlow: ({ recoveryCode }: { recoveryCode?: string }) => <p>post-auth:{recoveryCode ?? "none"}</p>,
}));
vi.mock("@/components/sync/sync-provider", () => ({
  useSync: () => ({ status: "idle", lastSyncedAt: undefined, conflicts: [], syncNow: () => undefined }),
}));
vi.mock("@/components/ui/transmission-window", () => ({ TransmissionWindow: () => null }));

function Harness() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    rerenders.add(rerender);
    return () => { rerenders.delete(rerender); };
  }, []);
  return <AccountView />;
}

afterEach(() => {
  cleanup();
  signedIn = false;
});

describe("AccountView post-auth flow", () => {
  it("still shows the recovery code after sign-up flips the app to signed-in", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Need an account? Create one" }));
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ana" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => { expect(screen.getByText("post-auth:ABCDEFGHJK")).toBeTruthy(); });
    // ...and not the signed-in page underneath it.
    expect(screen.queryByText("Sync status")).toBeNull();
  });

  it("runs the post-auth flow for a plain sign-in too (guest data may need migrating)", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ana" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => { expect(screen.getByText("post-auth:none")).toBeTruthy(); });
  });

  it("shows the signed-in page when nobody just signed in", () => {
    signedIn = true;
    render(<Harness />);
    expect(screen.getByText("Sync status")).toBeTruthy();
  });
});
