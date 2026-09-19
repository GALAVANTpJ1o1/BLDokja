import { test, expect } from "@playwright/test";

test("colourways, scenery and compact layout persist independently of sticker colours", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/settings/");
  await expect(page.getByRole("radio", { name: /Jade lagoon/ })).toBeEnabled();
  await page.getByRole("radio", { name: "Dim room", exact: true }).locator("..").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("radio", { name: /Jade lagoon/ }).locator("..").click();
  await expect(page.locator("html")).toHaveAttribute("data-colourway", "jade");
  await page.getByRole("radio", { name: /Forest.*Selected|^Forest$/ }).locator("..").click();
  await expect(page.locator("html")).toHaveAttribute("data-environment", "forest");
  await page.getByRole("radio", { name: "Compact", exact: true }).locator("..").click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.getByRole("radio", { name: "Compact", exact: true })).toBeEnabled();
  const green = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--face-f").trim());
  expect(green.toUpperCase()).toBe("#1FA25A");
  await page.evaluate(async () => { await document.fonts.ready; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => { scrollTo(0, 0); });
  await page.screenshot({ path: `.artifacts/appearance-${info.project.name}.png`, fullPage: true, scale: "css", animations: "disabled" });
  await page.getByRole("group", { name: "Colour theme", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.artifacts/appearance-viewport-${info.project.name}.png`, scale: "css", animations: "disabled" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-colourway", "jade");
  await expect(page.locator("html")).toHaveAttribute("data-environment", "forest");
  await expect(page.getByRole("radio", { name: "Compact", exact: true })).toBeChecked();
  for (const name of ["Galaxy", "Rain", "Snow", "Ocean", "Still studio"]) {
    await page.getByRole("radio", { name: new RegExp(`^${name}(?: Selected)?$`) }).locator("..").click();
    await expect(page.getByText("Appearance saved on this device.", { exact: true })).toBeVisible();
  }
  await page.getByRole("radio", { name: "Daylight", exact: true }).locator("..").click();
  for (const name of ["Slate studio", "Coral dusk", "Cotton skies", "Ocean blue", "Forest moss"]) {
    await page.getByRole("radio", { name: new RegExp(`^${name}(?: Selected)?$`) }).locator("..").click();
    await expect(page.getByText("Appearance saved on this device.", { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("reduced-motion scenery remains still on scroll", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings/");
  const canvas = page.locator("canvas.starfield");
  await expect(page.locator("html")).toHaveAttribute("data-environment", "galaxy");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.evaluate(async () => { await new Promise<void>(resolve => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); }); });
  const before = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await page.evaluate(() => { scrollTo(0, 800); });
  const after = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  expect(after === before).toBe(true);
});
