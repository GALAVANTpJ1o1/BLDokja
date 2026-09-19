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
// What the account's profile says, and what the form tried to write back; both reset after each test.
let storedLeaderboard: { optIn: boolean; displayName: string } | undefined = { optIn: false, displayName: "solver-000000" };
const leaderboardSaves: [boolean, string | undefined][] = [];
// When set, signUp() flips the auth state at once but only returns when the test says so, as the real
// one does (it keeps working after the session exists: recovery code, timezone).
const heldSignUp: { hold: boolean; release?: () => void } = { hold: false };
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
      const result = { userId: "u1", recoveryCode: "ABCDEFGHJK" };
      if (!heldSignUp.hold) return Promise.resolve(result);
      return new Promise<typeof result>((resolve) => { heldSignUp.release = () => { resolve(result); }; });
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
    getLeaderboardSettings: () => Promise.resolve(storedLeaderboard),
    setLeaderboardOptIn: (optIn: boolean, displayName?: string) => {
      leaderboardSaves.push([optIn, displayName]);
      return Promise.resolve();
    },
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
  storedLeaderboard = { optIn: false, displayName: "solver-000000" };
  leaderboardSaves.length = 0;
  heldSignUp.hold = false;
  heldSignUp.release = undefined;
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

  it("does not flash the signed-in page while sign-up is still finishing (D-076)", async () => {
    heldSignUp.hold = true;
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Need an account? Create one" }));
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ana" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    // The session exists and the app knows it, but the sign-up call has not returned: the reader must
    // not see the signed-in page here only to have a dialog replace it a moment later.
    await waitFor(() => { expect(heldSignUp.release).toBeDefined(); });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByText("Sync status")).toBeNull();

    heldSignUp.release?.();
    await waitFor(() => { expect(screen.getByText("post-auth:ABCDEFGHJK")).toBeTruthy(); });
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

/**
 * Regression (docs/DECISIONS.md D-074): the leaderboard form used to start unchecked and blank whatever
 * the account said, so pressing save on a page you had only opened opted an opted-in person back out.
 */
describe("leaderboard settings", () => {
  const OPT_IN = "Show my results on the public leaderboards";
  const NAME = "Public display name";
  const SAVE = "Save leaderboard settings";

  it("shows the stored opt-in and display name, and saving them untouched keeps both", async () => {
    signedIn = true;
    storedLeaderboard = { optIn: true, displayName: "fast-hands" };
    render(<Harness />);

    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>(OPT_IN).checked).toBe(true); });
    expect(screen.getByLabelText<HTMLInputElement>(NAME).value).toBe("fast-hands");

    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => { expect(screen.getByText("Leaderboard settings saved.")).toBeTruthy(); });
    expect(leaderboardSaves).toEqual([[true, "fast-hands"]]);
  });

  it("changing only the name leaves the opt-in as it was", async () => {
    signedIn = true;
    storedLeaderboard = { optIn: true, displayName: "fast-hands" };
    render(<Harness />);
    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>(OPT_IN).checked).toBe(true); });

    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "  quick-fingers " } });
    fireEvent.click(screen.getByRole("button", { name: SAVE }));

    await waitFor(() => { expect(leaderboardSaves).toEqual([[true, "quick-fingers"]]); });
  });

  it("a blank name means keep the current one, not set it to nothing", async () => {
    signedIn = true;
    storedLeaderboard = { optIn: false, displayName: "solver-a1b2c3" };
    render(<Harness />);
    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>(NAME).value).toBe("solver-a1b2c3"); });

    fireEvent.click(screen.getByLabelText(OPT_IN));
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE }));

    await waitFor(() => { expect(leaderboardSaves).toEqual([[true, undefined]]); });
  });

  it("cannot be saved while the stored settings are unknown, rather than saving guesses over them", async () => {
    signedIn = true;
    storedLeaderboard = undefined;
    render(<Harness />);

    await waitFor(() => { expect(screen.getByText(/Couldn't load your leaderboard settings/)).toBeTruthy(); });
    const save = screen.getByRole<HTMLButtonElement>("button", { name: SAVE });
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(leaderboardSaves).toEqual([]);
  });
});
