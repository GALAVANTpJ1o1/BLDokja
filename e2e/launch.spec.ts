import { expect, test, type Page } from "@playwright/test";

/**
 * v2 launch checks (plan §K scenarios 2 and 18): guest data survives a reload, and the contact,
 * privacy, leaderboard, 404, SEO and breadcrumb pieces are all really there. Needs no backend, so it
 * runs against a plain `pnpm dev`/`pnpm build` of the app.
 *
 * NOT YET RUN: written without a browser available (the authoring session could not reach
 * localhost). Expect to fix selectors or timings on first run.
 */

const SITE = "https://bldokja.pages.dev";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

test("contact and privacy pages load cleanly with one heading and no overflow", async ({ page }) => {
  const errors = collectErrors(page);
  for (const route of ["/contact/", "/privacy/"]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("main h1")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("account and leaderboard pages fit the viewport (380px on the mobile project)", async ({ page }) => {
  for (const route of ["/leaderboard/", "/account/"]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  await page.goto("/leaderboard/");
  await expect(page.locator("main h1")).toHaveCount(1);
});

test("contact details are the agreed ones", async ({ page }) => {
  await page.goto("/contact/");
  await expect(page.locator('a[href="mailto:rinckyshivkumarjain@gmail.com"]')).toBeVisible();
  const instagram = page.locator('a[href="https://www.instagram.com/PRANJAL_JAIN____/"]');
  await expect(instagram).toBeVisible();
  await expect(instagram).toHaveAttribute("rel", /noreferrer/);
});

test("the footer links to Contact and Privacy on every page", async ({ page }) => {
  for (const route of ["/", "/learn/", "/practice/"]) {
    await page.goto(route);
    await expect(page.locator('footer a[href="/contact/"]'), route).toBeVisible();
    await expect(page.locator('footer a[href="/privacy/"]'), route).toBeVisible();
  }
});

test("an unknown route shows the custom 404 page, not a framework default", async ({ page }) => {
  await page.goto("/definitely-not-a-page/");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("pages carry their own canonical URL and meta description, not the site-wide ones", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/`);
  const homeDescription = await page.locator('meta[name="description"]').getAttribute("content");

  await page.goto("/practice/3style/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/practice/3style/`);
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toBeTruthy();
  expect(description).not.toBe(homeDescription);

  await page.goto("/learn/notation/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/learn/notation/`);
});

test("open graph and twitter cards point at an image that exists", async ({ page, request }) => {
  await page.goto("/");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toBeTruthy();
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  // The absolute URL names the production host; fetch the same path from the host under test.
  const ogUrl = new URL(og ?? "");
  const response = await request.get(ogUrl.pathname + ogUrl.search);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
});

test("robots.txt and sitemap.xml are served and consistent with each other", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).toContain("Disallow: /lab/");
  expect(robotsText).toContain(`Sitemap: ${SITE}/sitemap.xml`);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  for (const path of ["/", "/contact/", "/privacy/", "/leaderboard/", "/practice/3style/", "/learn/notation/"]) expect(xml, path).toContain(`<loc>${SITE}${path}</loc>`);
  expect(xml).not.toContain("/lab/");
  expect((xml.match(/<loc>/g) ?? []).length).toBeGreaterThan(50);
});

test("trainer pages show a breadcrumb trail ending on the current page", async ({ page }) => {
  await page.goto("/practice/3style/");
  const trail = page.locator('nav[aria-label="Breadcrumb"]');
  await expect(trail.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  await expect(trail.getByRole("link", { name: "Practice" })).toHaveAttribute("href", "/practice/");
  await expect(trail.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
});

test("5BLD is labelled as still being built before you open it", async ({ page }) => {
  await page.goto("/practice/");
  await expect(page.locator('a[href="/practice/big-cubes/"]')).toContainText("Building");
});

test("a guest's settings survive a reload (scenario 2)", async ({ page }) => {
  await page.goto("/settings/");
  const goal = page.getByLabel("Set a daily practice goal");
  await goal.check();
  await page.getByLabel("Graded attempts per day").fill("35");
  // There is no on-screen signal that the IndexedDB write finished; give it a moment before reloading.
  await page.waitForTimeout(1000);

  await expect
    .poll(async () => {
      await page.reload();
      await page.waitForTimeout(1000);
      return goal.isChecked();
    }, { timeout: 20_000 })
    .toBe(true);
  await expect(page.getByLabel("Graded attempts per day")).toHaveValue("35");
});
