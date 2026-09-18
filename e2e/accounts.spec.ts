import { expect, test, type Page } from "@playwright/test";

/**
 * Account, isolation and cross-context sync checks (plan §K scenarios 5, 12 and 15).
 *
 * These talk to the REAL Supabase project the build was configured with (NEXT_PUBLIC_SUPABASE_URL /
 * _ANON_KEY), creating and then deleting throwaway accounts, so they only run when asked for:
 *
 *   BLD_E2E_ACCOUNTS=1 BLD_TEST_URL=http://localhost:3000 pnpm exec playwright test accounts --project=chromium
 *
 * Every account is named `e2e-...`. A test that fails halfway can leave one behind; delete leftovers
 * from the Supabase dashboard (Authentication > Users) by that prefix.
 *
 * NOT YET RUN: written without a browser available (the authoring session could not reach
 * localhost). Expect to fix selectors or timings on first run. Scenarios that are covered by unit
 * tests instead (events dedupe, offline queue, conflicts, deletions, RLS) live in apps/web/src/lib/sync
 * and supabase/ -- see docs/DECISIONS.md D-060 to D-065.
 */

test.skip(process.env.BLD_E2E_ACCOUNTS !== "1", "set BLD_E2E_ACCOUNTS=1 to run tests that create real (throwaway) accounts");

const PASSWORD = "e2e-Password-1234";
const RECOVERY_CODE = /^[2-9A-HJKMNP-Z]{10}$/;

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== "chromium", "account flows run on one desktop browser only");
});

function newUsername(): string {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function finishPostAuth(page: Page): Promise<void> {
  // If this browser holds guest data the migration prompt appears first; these tests always skip it
  // unless they are exercising it on purpose.
  const skip = page.getByRole("button", { name: "Skip for now" });
  const signedIn = page.getByText("Signed in as");
  await expect(skip.or(signedIn)).toBeVisible({ timeout: 30_000 });
  if (await skip.isVisible()) await skip.click();
  await expect(signedIn).toBeVisible({ timeout: 30_000 });
}

async function signUp(page: Page, username: string): Promise<string> {
  await page.goto("/account/");
  await page.getByRole("button", { name: "Need an account? Create one" }).click();
  await page.getByLabel("Username").fill(username);
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
  await page.goto("/account/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function signOut(page: Page): Promise<void> {
  await page.goto("/account/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function deleteAccount(page: Page): Promise<void> {
  await page.goto("/account/");
  await page.getByRole("button", { name: "Delete account", exact: true }).first().click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete account", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function deleteIfSignedIn(page: Page): Promise<void> {
  await page.goto("/account/");
  if (await page.getByText("Signed in as").isVisible({ timeout: 5000 }).catch(() => false)) await deleteAccount(page);
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
    await deleteIfSignedIn(page);
  }
});

test("a signed-in account never sees the guest's data, and signing out brings the guest's back (scenario 12)", async ({ page }) => {
  test.setTimeout(240_000);
  const username = newUsername();
  const goal = page.getByLabel("Set a daily practice goal");
  try {
    // As a guest: turn the daily goal on and confirm it stuck.
    await page.goto("/settings/");
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
    await page.goto("/settings/");
    await page.waitForTimeout(1500); // settings load from storage after first paint; an unchecked box before then proves nothing
    await expect(goal).not.toBeChecked();

    // Signing out returns to the guest database, untouched.
    await signOut(page);
    await page.goto("/settings/");
    await expect.poll(() => goal.isChecked(), { timeout: 15_000 }).toBe(true);
  } finally {
    // Sign back in to be able to delete the throwaway account (this skips the migration prompt).
    await signIn(page, username);
    await finishPostAuth(page).catch(() => undefined);
    await deleteIfSignedIn(page);
  }
});

test("the same account syncs a setting across two browser contexts (scenario 5)", async ({ page, browser, baseURL }) => {
  test.setTimeout(300_000);
  const username = newUsername();
  const second = await browser.newContext(baseURL === undefined ? {} : { baseURL });
  const other = await second.newPage();
  try {
    await signUp(page, username);
    await page.goto("/settings/");
    await page.getByLabel("Set a daily practice goal").check();
    await page.getByLabel("Graded attempts per day").fill("35");
    await page.waitForTimeout(1000);

    // Push now rather than waiting for the 60-second timer.
    await page.goto("/account/");
    await page.getByRole("button", { name: "Sync now" }).click();
    await page.waitForTimeout(3000);

    // A second, empty browser signs in and should receive the setting.
    await signIn(other, username);
    await finishPostAuth(other);
    await expect
      .poll(async () => {
        await other.goto("/settings/");
        await other.waitForTimeout(1500);
        return other.getByLabel("Set a daily practice goal").isChecked();
      }, { timeout: 150_000, intervals: [3000] })
      .toBe(true);
    await expect(other.getByLabel("Graded attempts per day")).toHaveValue("35");
  } finally {
    await second.close();
    await deleteIfSignedIn(page);
  }
});
