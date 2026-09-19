import { expect, test, type Page } from "@playwright/test";

/**
 * The page guides (docs/DECISIONS.md D-078): a short walk-through that opens by itself the first time you
 * visit a page. Every guided page is walked here in a real browser, as a first-time visitor, step by step:
 * the ring must be on screen, the card fully visible and clear of the highlighted area, and after "Done"
 * the guide must not come back. No backend needed.
 *
 * Runs on desktop Chromium and on the phone project (where the card is a sheet along the bottom).
 */

// Every other spec starts as a returning visitor (playwright.config.ts); this one starts as a new one.
test.use({ storageState: { cookies: [], origins: [] } });

const ROUTES = [
  "/", "/learn/", "/learn/notation/", "/practice/", "/practice/speffz/", "/practice/trace/", "/practice/m2op/", "/practice/3style/", "/practice/4bld/", "/practice/pairs/",
  "/practice/sandbox/", "/practice/weak/", "/practice/difficulty/", "/practice/first-solve/", "/practice/levels/", "/practice/debug/", "/practice/algorithms/",
  "/practice/memory/", "/practice/reference/", "/practice/big-cubes/", "/practice/f2l/", "/practice/last-layer/", "/reference/", "/reference/oll/", "/progress/", "/settings/", "/settings/lettering/", "/account/", "/leaderboard/",
];

test.beforeEach(({ browserName, isMobile }, info) => {
  // Desktop Chromium, and the iPhone project (WebKit): the two layouts of the card.
  test.skip(!(browserName === "chromium" || (isMobile && info.project.name === "mobile")), "guides are checked on desktop Chromium and the phone project");
});

/** Lessons ask how they should talk, in a modal that must be answered before the guide can open. */
async function open(page: Page, route: string): Promise<void> {
  await page.goto(route);
  const plain = page.getByRole("dialog").getByRole("button", { name: /^Plain and precise/ });
  if (await plain.waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false)) await plain.click();
}

interface Geometry {
  readonly spot: { x: number; y: number; right: number; bottom: number } | undefined;
  readonly card: { x: number; y: number; right: number; bottom: number } | undefined;
  readonly mode: string | null | undefined;
  readonly dock: string | null | undefined;
  readonly vw: number;
  readonly vh: number;
  readonly overflow: number;
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (el === null) return undefined;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    };
    return {
      spot: box(document.querySelector(".guide-spot")),
      card: box(document.querySelector(".guide-card")),
      mode: document.querySelector(".guide-card")?.getAttribute("data-mode"),
      dock: document.querySelector(".guide-card")?.getAttribute("data-dock"),
      vw: innerWidth,
      vh: innerHeight,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

async function counter(page: Page): Promise<{ n: number; total: number }> {
  const text = (await page.locator(".guide-step").innerText()).trim();
  const match = /^Step (\d+) of (\d+)$/.exec(text);
  if (match === null) throw new Error(`unexpected step counter: ${text}`);
  return { n: Number(match[1]), total: Number(match[2]) };
}

for (const route of ROUTES) {
  test(`${route}: opens by itself once, walks through every step on screen, and stays closed after Done`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await open(page, route);
    const layer = page.locator(".guide-layer");
    await expect(layer, "the guide opens by itself on a first visit").toBeVisible({ timeout: 45_000 });

    const { total } = await counter(page);
    expect(total, "a guide has more than one step").toBeGreaterThanOrEqual(2);

    for (let expected = 1; expected <= total; expected++) {
      await expect(page.locator(".guide-step")).toHaveText(`Step ${String(expected)} of ${String(total)}`);
      // The spotlight follows the page, so give it a moment to settle after each step.
      await page.waitForTimeout(500);
      const g = await geometry(page);
      const where = `${route} step ${String(expected)}`;
      if (g.spot === undefined || g.card === undefined) throw new Error(`${where}: no spotlight or card`);
      // The highlighted area is on screen (at least its start), and the card is fully visible.
      expect(g.spot.bottom, `${where}: ring above the screen`).toBeGreaterThan(0);
      expect(g.spot.y, `${where}: ring below the screen`).toBeLessThan(g.vh);
      expect(g.card.x, `${where}: card off the left`).toBeGreaterThanOrEqual(-0.5);
      expect(g.card.y, `${where}: card off the top`).toBeGreaterThanOrEqual(-0.5);
      expect(g.card.right, `${where}: card off the right`).toBeLessThanOrEqual(g.vw + 0.5);
      expect(g.card.bottom, `${where}: card off the bottom`).toBeLessThanOrEqual(g.vh + 0.5);
      if (g.mode === "beside") {
        const clear = g.card.right <= g.spot.x + 0.5 || g.card.x >= g.spot.right - 0.5 || g.card.bottom <= g.spot.y + 0.5 || g.card.y >= g.spot.bottom - 0.5;
        expect(clear, `${where}: card covers the highlighted area`).toBe(true);
      }
      if (g.mode === "sheet" && g.dock === "top") expect(g.spot.y, `${where}: the highlighted area is hidden behind the sheet`).toBeGreaterThanOrEqual(g.card.bottom - 0.5);
      else if (g.mode === "sheet") expect(g.spot.y, `${where}: the start of the highlighted area is hidden behind the sheet`).toBeLessThan(g.card.y);
      expect(g.overflow, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(0);
      await expect(page.locator(".guide-title")).not.toBeEmpty();

      if (expected < total) {
        await page.getByRole("button", { name: "Next", exact: true }).click();
      } else {
        await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Done", exact: true }).click();
      }
    }

    await expect(layer).toHaveCount(0);
    // Marked as seen: a reload does not bring it back.
    await page.reload();
    await page.waitForTimeout(4000);
    await expect(page.locator(".guide-layer"), "a guide that has been finished never reopens by itself").toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("the Page guide button replays a guide on demand, and only on pages that have one", async ({ page }) => {
  await open(page, "/settings/");
  await expect(page.locator(".guide-layer")).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  await expect(page.locator(".guide-layer")).toHaveCount(0);

  const button = page.getByRole("button", { name: "Page guide", exact: true });
  await button.click();
  await expect(page.locator(".guide-layer")).toBeVisible();
  await expect(page.locator(".guide-step")).toHaveText(/^Step 1 of \d+$/);
  // Escape closes it and hands focus back to the button that opened it.
  await page.keyboard.press("Escape");
  await expect(page.locator(".guide-layer")).toHaveCount(0);
  await expect(button).toBeFocused();

  await page.goto("/contact/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Page guide", exact: true })).toHaveCount(0);
  await page.goto("/privacy/");
  await expect(page.getByRole("button", { name: "Page guide", exact: true })).toHaveCount(0);
});

test("Back goes to the earlier step, the arrow keys move between steps, and Skip closes for good", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard navigation is a desktop check");
  await open(page, "/practice/memory/");
  await expect(page.locator(".guide-layer")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Back", exact: true }), "no Back on the first step").toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".guide-step")).toHaveText(/^Step 2 of/);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(".guide-step")).toHaveText(/^Step 1 of/);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".guide-step")).toHaveText(/^Step 1 of/);

  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  await expect(page.locator(".guide-layer")).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(4000);
  await expect(page.locator(".guide-layer")).toHaveCount(0);
});

test("the old Site guide is gone", async ({ page }) => {
  await open(page, "/");
  await expect(page.getByRole("button", { name: "Site guide", exact: true })).toHaveCount(0);
  await expect(page.getByText("Show me around")).toHaveCount(0);
});
