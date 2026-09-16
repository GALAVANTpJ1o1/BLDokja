import { test, expect } from "@playwright/test";

test("Speffz round shows whole pieces, checks every sticker and saves recognition independently", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/practice/speffz/");
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Start round", exact: true }).click();
  await expect(page.getByText("Piece 1 of 10", { exact: true })).toBeVisible();
  const stickers = page.getByRole("button", { name: /sticker on .* face/ });
  await expect(stickers).toHaveCount(2);
  await expect(page.getByRole("img").first().locator('rect[fill="var(--rule)"]')).toHaveCount(46);
  const field = page.getByLabel("Sticker letter", { exact: true });
  await stickers.first().click();
  await field.fill("!");
  await field.press("Enter");
  const feedback = await page.getByRole("status").filter({ hasText: "Not quite" }).textContent() ?? "";
  const letter = /sticker is ([A-X])/.exec(feedback)?.[1];
  expect(letter).toBeTruthy();
  await field.fill(letter ?? "");
  await field.press("Enter");
  await expect(field).toBeFocused();
  await expect(stickers.first()).toBeDisabled();
  await field.fill("!");
  await field.press("Enter");
  const other = /sticker is ([A-X])/.exec(await page.getByRole("status").filter({ hasText: "Not quite" }).textContent() ?? "")?.[1];
  await field.fill(other ?? "");
  await field.press("Enter");
  await expect(page.getByRole("button", { name: "Next piece", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Next piece", exact: true }).click();
  await expect(page.getByText("Piece 2 of 10", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to practice", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.artifacts/speffz-${info.project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByText("0 of 2 first attempts correct", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("corner rounds reveal three stickers and complete all ten physical pieces", async ({ page }) => {
  await page.goto("/practice/speffz/");
  await page.getByRole("button", { name: "Corners", exact: true }).click();
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Start round", exact: true }).click();
  const stickers = page.getByRole("button", { name: /sticker on .* face/ });
  const field = page.getByLabel("Sticker letter", { exact: true });
  for (let piece = 1; piece <= 10; piece += 1) {
    await expect(page.getByText(`Piece ${piece} of 10`, { exact: true })).toBeVisible();
    await expect(stickers).toHaveCount(3);
    await expect(page.getByRole("img").first().locator('rect[fill="var(--rule)"]')).toHaveCount(45);
    await stickers.first().click();
    for (let sticker = 0; sticker < 3; sticker += 1) {
      await field.fill("!");
      await field.press("Enter");
      const feedback = page.getByRole("status").filter({ hasText: "Not quite" });
      await expect(feedback).toBeVisible();
      const letter = /sticker is ([A-X])/.exec(await feedback.textContent() ?? "")?.[1];
      expect(letter).toBeTruthy();
      await field.fill(letter ?? "");
      await field.press("Enter");
      await expect(stickers.nth(sticker)).toBeDisabled();
    }
    await page.getByRole("button", { name: "Next piece", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Round complete", exact: true })).toBeVisible();
  await expect(page.getByText("0 of 30 first attempts correct", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/s total$/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("0 of 30 first attempts correct", { exact: true })).toBeVisible();
});
