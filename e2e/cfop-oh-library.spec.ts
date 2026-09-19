import { expect, test } from "@playwright/test";

test("the OH path and the verified CFOP reference remain reachable on a phone-sized page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/learn/");
  await expect(page.getByRole("heading", { name: "3×3 one-handed", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "One-handed fundamentals — stable grip, calm turns", exact: true }).click();
  await expect(page.getByRole("heading", { name: "One-handed fundamentals — stable grip, calm turns", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "One-handed right-side trigger shown with replay controls", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // The algorithm library's CFOP family now points at the curated cheat sheets, and each is a page of cards (no table, no solver ids).
  await page.goto("/practice/algorithms/");
  await page.getByRole("combobox", { name: /Reference group/ }).selectOption("cfop");
  await page.getByRole("link", { name: /Full PLL reference/ }).click();
  await expect(page.getByRole("heading", { name: "Full PLL reference", exact: true })).toBeVisible();
  await expect(page.locator("article.case-card")).toHaveCount(21);
  await expect(page.locator("main")).not.toContainText(/pll-\d\d/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
