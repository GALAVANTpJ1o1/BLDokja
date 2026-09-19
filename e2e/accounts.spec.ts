import { expect, test, type Page } from "@playwright/test";

/**
 * Account, isolation and cross-context sync checks (plan §K scenarios 5, 12 and 15), plus the
 * leaderboard-settings round trip (D-074).
 *
 * These talk to the REAL Supabase project the build was configured with (NEXT_PUBLIC_SUPABASE_URL /
 * _ANON_KEY), creating and then deleting throwaway accounts, so they only run when asked for:
 *
 *   BLD_E2E_ACCOUNTS=1 BLD_TEST_URL=http://localhost:3000 pnpm exec playwright test accounts --project=chromium
 *
 * Every account is named `e2e-...`. A test that fails halfway can leave one behind; delete leftovers
 * from the Supabase dashboard (Authentication > Users) by that prefix.
 *
 * Runs so far, on the owner's machine (D-070, D-071):
 *   1. All three timed out: the dev server had no Supabase variables, so the account page said
 *      accounts were unavailable. beforeEach now reports that in 15 seconds instead.
 *   2. All three timed out waiting for the recovery-code dialog -- a real bug in the app, fixed.
 *   3. Scenario 12 passed; 15 and 5 passed their bodies and then hung in cleanup, which had misread
 *      a not-yet-rendered account page as signed out (see openAccountPage below). Leftover accounts
 *      from that run need deleting by hand.
 *   4. All three reached deletion and were blocked by the Edge Function's CORS list -- another real
 *      bug, fixed and redeployed.
 *   5. 12 and 5 passed in seconds. 15 hit the post-auth reload mid-navigation (see gotoStable).
 *   6. Against the live site: 13 of 14 passed; the one failure was the share image's content type (D-073).
 *   7. Live again: 3 of 4; scenario 12's cleanup raced the signed-in page flashing before the migration
 *      dialog (D-076, fixed in the app and in finishPostAuth).
 *   8. Live, all four scenarios (including the leaderboard round trip, D-074): 4 of 4 passed.
 * Scenarios covered by unit tests instead (events dedupe, offline queue, conflicts, deletions, RLS)
 * live in apps/web/src/lib/sync and supabase/ -- see docs/DECISIONS.md D-060 to D-065.
 */

test.skip(process.env.BLD_E2E_ACCOUNTS !== "1", "set BLD_E2E_ACCOUNTS=1 to run tests that create real (throwaway) accounts");

const PASSWORD = "e2e-Password-1234";
const RECOVERY_CODE = /^[2-9A-HJKMNP-Z]{10}$/;

test.beforeEach(async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "account flows run on one desktop browser only");
  // Fail fast and say why: without the Supabase variables the account page shows "Accounts aren't
  // available in this build yet." and every step below would wait out its full timeout for a button
  // that can never appear.
  await gotoStable(page, "/account/");
  await expect(
    page.getByRole("button", { name: "Need an account? Create one" }),
    "accounts are not configured in this build: apps/web/.env.local needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, and `pnpm dev` must be restarted after editing it",
  ).toBeVisible({ timeout: 15_000 });
});

function newUsername(): string {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const NAVIGATION_ATTEMPTS = 3;

/**
 * `page.goto` that survives the app reloading itself underneath it. AccountProvider reloads the page
 * whenever the active account changes, because local storage is namespaced per account, and a reload
 * that lands mid-navigation aborts it with net::ERR_ABORTED. That is the app working as designed --
 * it took scenario 15 down on the step right after the post-auth flow, which ends in exactly such a
 * reload -- so go again instead of failing.
 */
async function gotoStable(page: Page, path: string): Promise<void> {
  for (let attempt = 1; attempt <= NAVIGATION_ATTEMPTS; attempt++) {
    try {
      await page.goto(path);
      return;
    } catch (error) {
      const aborted = error instanceof Error && error.message.includes("net::ERR_ABORTED");
      if (!aborted || attempt === NAVIGATION_ATTEMPTS) throw error;
      await page.waitForTimeout(500);
    }
  }
}

/**
 * Open /account/ and wait until it has decided which of its two views to show.
 *
 * Nothing renders there until Supabase's first session check comes back, and `locator.isVisible()`
 * never waits -- its `timeout` option is documented as ignored. Reading the page straight after
 * `goto` therefore sees an empty page and answers "not signed in" whatever the truth is. That is how
 * the second real run wasted two full test timeouts: cleanup decided it was signed out, and
 * `getByLabel("Username")` (a case-insensitive substring match) then found the signed-in view's
 * "New username" box, typed the username into it, and waited out the test for a "Password" field
 * that only exists on the signed-out form. Every label match below is `exact` for the same reason.
 */
type AccountPageState = "signed-in" | "signed-out";

async function openAccountPage(page: Page): Promise<AccountPageState> {
  await gotoStable(page, "/account/");
  const signedIn = page.getByText("Signed in as");
  const signedOut = page.getByRole("button", { name: "Need an account? Create one" });
  await expect(signedIn.or(signedOut)).toBeVisible({ timeout: 30_000 });
  return (await signedIn.isVisible()) ? "signed-in" : "signed-out";
}

async function finishPostAuth(page: Page): Promise<void> {
  // If this browser holds guest data the migration prompt appears first; these tests always skip it
  // unless they are exercising it on purpose.
  const skip = page.getByRole("button", { name: "Skip for now" });
  const signedIn = page.getByText("Signed in as");
  // Retried as a unit, not "see the button, then check it, then click": the dialog can appear a moment
  // after the auth call returns, and a separate isVisible() between the wait and the click sees whatever
  // the page is showing at that instant. The fourth real run lost a cleanup to exactly that, waiting 30
  // seconds beside a dialog nobody clicked (D-076). click() itself waits for the button.
  await expect(async () => {
    if (await skip.isVisible()) await skip.click();
    await expect(signedIn).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

async function signUp(page: Page, username: string): Promise<string> {
  expect(await openAccountPage(page), "signUp() was called while already signed in").toBe("signed-out");
  await page.getByRole("button", { name: "Need an account? Create one" }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  await expect(page.getByText("Save your recovery code")).toBeVisible({ timeout: 30_000 });
  const code = (await page.locator("p.mono").innerText()).trim();
  await page.getByLabel("I've saved this code somewhere safe").check();
  await page.getByRole("button", { name: "I've saved it, continue" }).click();
  await finishPostAuth(page);
  return code;
}

async function signIn(page: Page, username: string, password = PASSWORD): Promise<void> {
  expect(await openAccountPage(page), "signIn() was called while already signed in").toBe("signed-out");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function signOut(page: Page): Promise<void> {
  expect(await openAccountPage(page), "signOut() was called while not signed in").toBe("signed-in");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function deleteAccount(page: Page): Promise<void> {
  expect(await openAccountPage(page), "deleteAccount() was called while not signed in").toBe("signed-in");
  await page.getByRole("button", { name: "Delete account", exact: true }).first().click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete account", exact: true }).last().click();
  // The dialog reports its own failures now, so say what went wrong instead of timing out in
  // silence the way the third run did on a CORS-blocked Edge Function call (D-071).
  const signedOut = page.getByRole("heading", { name: "Sign in", exact: true });
  const failed = page.getByRole("dialog").getByRole("alert");
  await expect(signedOut.or(failed)).toBeVisible({ timeout: 30_000 });
  if (await failed.isVisible()) throw new Error(`the app refused to delete the account: ${(await failed.innerText()).trim()}`);
}

// Cleanup that works from whatever state a test left the page in -- signed in (delete), signed out
// (sign in, skip any migration prompt, delete), or the account never created / already deleted
// (nothing to do) -- and that fails within its own waits instead of running the test's clock out.
async function cleanUp(page: Page, username: string): Promise<void> {
  if ((await openAccountPage(page)) === "signed-in") {
    await deleteAccount(page);
    return;
  }
  await signIn(page, username);
  const signedIn = page.getByText("Signed in as");
  const migrationPrompt = page.getByRole("button", { name: "Skip for now" });
  const rejected = page.getByText("Wrong username or password");
  await expect(signedIn.or(migrationPrompt).or(rejected)).toBeVisible({ timeout: 30_000 });
  if (await rejected.isVisible()) return; // there is no such account: nothing to clean up
  await finishPostAuth(page);
  await deleteAccount(page);
}

test("sign up, sign out, reject a wrong password, sign back in, delete, and the username is free again (scenario 15)", async ({ page }) => {
  test.setTimeout(240_000);
  const username = newUsername();
  try {
    const code = await signUp(page, username);
    expect(code).toMatch(RECOVERY_CODE);
    await expect(page.getByText(username)).toBeVisible();

    await signOut(page);
    await signIn(page, username, "not-the-password");
    // p[role=alert], not any alert: Next's own route announcer is also role="alert".
    await expect(page.locator('p[role="alert"]')).toContainText("Wrong username or password");

    await signIn(page, username);
    await finishPostAuth(page);

    await deleteAccount(page);

    // Deleting really removed the account: the same username can be registered again from scratch.
    const again = await signUp(page, username);
    expect(again).toMatch(RECOVERY_CODE);
    expect(again).not.toBe(code);
  } finally {
    await cleanUp(page, username);
  }
});

test("a signed-in account never sees the guest's data, and signing out brings the guest's back (scenario 12)", async ({ page }) => {
  test.setTimeout(240_000);
  const username = newUsername();
  const goal = page.getByLabel("Set a daily practice goal");
  try {
    // As a guest: turn the daily goal on and confirm it stuck.
    await gotoStable(page, "/settings/");
    await goal.check();
    await page.waitForTimeout(1000);
    await expect
      .poll(async () => {
        await page.reload();
        await page.waitForTimeout(1000);
        return goal.isChecked();
      }, { timeout: 20_000 })
      .toBe(true);

    // A new account is a separate local database: the guest's goal is not there (the migration
    // prompt was skipped by finishPostAuth, so nothing was copied over either).
    await signUp(page, username);
    await gotoStable(page, "/settings/");
    await page.waitForTimeout(1500); // settings load from storage after first paint; an unchecked box before then proves nothing
    await expect(goal).not.toBeChecked();

    // Signing out returns to the guest database, untouched.
    await signOut(page);
    await gotoStable(page, "/settings/");
    await expect.poll(() => goal.isChecked(), { timeout: 15_000 }).toBe(true);
  } finally {
    await cleanUp(page, username);
  }
});

test("the same account syncs a setting across two browser contexts (scenario 5)", async ({ page, browser, baseURL }) => {
  test.setTimeout(300_000);
  const username = newUsername();
  const second = await browser.newContext(baseURL === undefined ? {} : { baseURL });
  const other = await second.newPage();
  try {
    await signUp(page, username);
    await gotoStable(page, "/settings/");
    await page.getByLabel("Set a daily practice goal").check();
    await page.getByLabel("Graded attempts per day").fill("35");
    await page.waitForTimeout(1000);

    // Push now rather than waiting for the 60-second timer.
    await gotoStable(page, "/account/");
    await page.getByRole("button", { name: "Sync now" }).click();
    await page.waitForTimeout(3000);

    // A second, empty browser signs in and should receive the setting.
    await signIn(other, username);
    await finishPostAuth(other);
    await expect
      .poll(async () => {
        await gotoStable(other, "/settings/");
        await other.waitForTimeout(1500);
        return other.getByLabel("Set a daily practice goal").isChecked();
      }, { timeout: 150_000, intervals: [3000] })
      .toBe(true);
    await expect(other.getByLabel("Graded attempts per day")).toHaveValue("35");
  } finally {
    await second.close();
    await cleanUp(page, username);
  }
});

test("leaderboard settings are read from the account, saved, and still there after a reload (D-074)", async ({ page }) => {
  test.setTimeout(240_000);
  const username = newUsername();
  try {
    await signUp(page, username);
    const optIn = page.getByLabel("Show my results on the public leaderboards", { exact: true });
    const name = page.getByLabel("Public display name", { exact: true });

    // The form loads the stored values before it allows edits; a new account is not opted in and starts
    // with an anonymous name, never the login username.
    await expect(optIn).toBeEnabled({ timeout: 30_000 });
    await expect(optIn).not.toBeChecked();
    await expect(name).toHaveValue(/^solver-[0-9a-f]{6}$/);

    await optIn.check();
    await name.fill("e2e-fast-hands");
    await page.getByRole("button", { name: "Save leaderboard settings", exact: true }).click();
    await expect(page.getByText("Leaderboard settings saved.")).toBeVisible({ timeout: 30_000 });

    // Reload: what comes back must be what the server holds, not the form's defaults.
    await page.reload();
    await expect(optIn).toBeEnabled({ timeout: 30_000 });
    await expect(optIn).toBeChecked();
    await expect(name).toHaveValue("e2e-fast-hands");

    // Saving without touching anything must not undo it (the bug this test exists for).
    await page.getByRole("button", { name: "Save leaderboard settings", exact: true }).click();
    await expect(page.getByText("Leaderboard settings saved.")).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(optIn).toBeEnabled({ timeout: 30_000 });
    await expect(optIn).toBeChecked();
  } finally {
    await cleanUp(page, username);
  }
});
