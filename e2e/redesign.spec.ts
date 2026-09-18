import { expect, test } from "@playwright/test";

const routes = ["/", "/learn/", "/learn/notation/", "/learn/parity/", "/learn/cfop-two-look-oll/", "/learn/cfop-pairing-extraction/", "/learn/oh-fundamentals-grip/", "/practice/", "/practice/speffz/", "/practice/trace/", "/practice/pairs/", "/practice/algorithms/", "/practice/3style/", "/practice/m2op/", "/practice/weak/", "/practice/levels/", "/practice/first-solve/", "/practice/memory/", "/practice/reference/", "/practice/sandbox/", "/practice/debug/", "/practice/4bld/", "/practice/big-cubes/", "/practice/difficulty/", "/progress/", "/settings/", "/settings/lettering/", "/lab/", "/contact/", "/privacy/", "/leaderboard/"];

test("every major redesigned route fits the viewport without console errors", async ({ page }, info) => {
  test.setTimeout(180_000);
  if (info.project.name === "chromium") await page.setViewportSize({ width: 1440, height: 1000 });
  if (info.project.name === "mobile") await page.setViewportSize({ width: 380, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("main h1")).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    await expect(page.locator("main")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("signature cube starts solved and safely coalesces rapid interactions", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/settings/");
  const cube = page.locator(".nav-cube");
  await expect(cube).toHaveAttribute("data-pattern", "Solved");
  await expect(cube.locator("twisty-player")).toHaveCount(1);
  await cube.click();
  // A completed checkerboard is followed by three requests while another route is in flight.
  await expect(cube).toHaveAttribute("data-pattern", "Checkerboard", { timeout: 30_000 });
  await cube.click(); await cube.click(); await cube.click();
  await expect(cube).toHaveAttribute("data-pattern", "Snake", { timeout: 45_000 });
  expect(await cube.locator("twisty-player").evaluate(async element => {
    const player = element as HTMLElement & {
      experimentalModel: {
        currentPattern: { get(): Promise<{ isIdentical(other: unknown): boolean }> };
        kpuzzle: { get(): Promise<{ defaultPattern(): { applyAlg(alg: string): unknown } }> };
      };
    };
    const [actual, puzzle] = await Promise.all([player.experimentalModel.currentPattern.get(), player.experimentalModel.kpuzzle.get()]);
    return actual.isIdentical(puzzle.defaultPattern().applyAlg("F' L D R B L F B' U' R L' D' F' L' B' U"));
  })).toBe(true);
});

test("reduced-motion cube changes to an exact static state without a running timeline", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings/");
  const cube = page.locator(".nav-cube");
  await expect(cube.locator("twisty-player")).toHaveCount(1);
  await cube.click();
  await expect(cube).toHaveAttribute("data-pattern", "Checkerboard");
  expect(await cube.locator("twisty-player").evaluate(async element => {
    const player = element as HTMLElement & { experimentalModel: { playingInfo: { get(): Promise<{ playing: boolean }> } } };
    return (await player.experimentalModel.playingInfo.get()).playing;
  })).toBe(false);
});
