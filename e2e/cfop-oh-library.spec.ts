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

  await page.goto("/practice/algorithms/");
  await page.getByLabel("Reference group", { exact: true }).selectOption("cfop");
  await expect(page.getByRole("heading", { name: "CFOP last-layer reference", exact: true })).toBeVisible();
  await page.getByLabel("Algorithm group", { exact: true }).selectOption("pll");
  const table = page.getByRole("table", { name: "Full PLL", exact: true });
  await expect(table.locator("tbody tr").first()).toBeVisible();
  await table.locator("tbody tr button").first().click();
  await expect(page.getByRole("img", { name: /Selected case: pll-/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
