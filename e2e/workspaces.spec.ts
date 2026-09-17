import { test, expect } from "@playwright/test";

test("home keeps the cube prominent without horizontal overflow", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("twisty-player")).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.artifacts/home-${info.project.name}.png`, fullPage: true });
});

test("all practice workspaces load without page errors or overflow", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror",(error) => errors.push(error.message));
  await page.goto("/settings/");
  await expect(page.getByRole("radio", { name: /Jade lagoon/ })).toBeEnabled();
  const voice = page.getByRole("radio", { name: "Plain and precise", exact: true });
  await voice.locator("..").click();
  await expect(voice).toBeChecked();
  for (const route of ["practice","practice/3style","practice/m2op","practice/trace","practice/algorithms","practice/memory","practice/debug","practice/levels","practice/reference","practice/big-cubes","learn/commutators","learn/three-style-corners","learn/m2-edges"]) {
    await page.goto(`/${route}/`);
    await expect(page.getByRole("heading",{ level:1 })).toBeVisible();
    await expect(page.locator("#content")).not.toContainText("Application error");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),route).toBe(true);
    if (["practice/3style","learn/commutators","practice/algorithms"].includes(route)) {
      const inspect = page.getByRole("button", { name: "Inspect in 3D", exact:true }).first();
      await expect(inspect).toBeVisible();
      await inspect.click();
      await page.locator("twisty-player").first().evaluate(async (element) => {
        const player = element as HTMLElement & { experimentalCurrentVantages(): Promise<Iterable<{ render(): Promise<void> }>> };
        await Promise.all(Array.from(await player.experimentalCurrentVantages(), (vantage) => vantage.render()));
      });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path:`.artifacts/${route.replaceAll("/","-")}-${info.project.name}.png`,fullPage:true });
    }
  }
  expect(errors).toEqual([]);
});

test("first solve checks one letter and resumes the saved step after reload", async ({ page }) => {
  await page.goto("/practice/first-solve/");
  const begin = page.getByRole("button",{ name:"Begin a new solve",exact:true });
  await expect(begin).toBeEnabled({ timeout:65_000 });
  await begin.click();
  await expect(page.getByLabel("Next memo letter",{ exact:true })).toBeVisible();
  await page.getByRole("button",{ name:"Show a hint",exact:true }).click();
  const answer = (await page.locator(".status-line.t-notation").textContent())?.split(" · ")[0] ?? "";
  await page.getByLabel("Next memo letter",{ exact:true }).fill(answer);
  await page.getByLabel("Next memo letter",{ exact:true }).press("Enter");
  await expect(page.getByText("Verified. Keep going.",{ exact:true })).toBeVisible();
  const title = await page.locator("section[aria-label] h2").textContent();
  await page.reload();
  await expect(page.locator("section[aria-label] h2")).toHaveText(title ?? "");
  await expect(page.getByLabel("Next memo letter",{ exact:true })).toHaveValue("");
});

test("preferred algorithms are verified, saved and listed without duplicate preferred rows", async ({ page }) => {
  await page.goto("/practice/algorithms/");
  const first = page.locator("table[aria-label='Algorithm library'] tbody tr").first();
  await expect(first).toBeVisible();
  const alg = await first.locator("td").nth(1).textContent() ?? "";
  await page.getByLabel("Algorithm",{ exact:true }).fill(alg);
  await page.getByRole("button",{ name:"Verify and save as preferred",exact:true }).click();
  await expect(first).toContainText("Your saved algorithm");
  await page.getByLabel("My saved cases",{ exact:true }).check();
  await expect(page.locator("table[aria-label='Algorithm library'] tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("table[aria-label='Algorithm library'] tbody tr").first()).toContainText("Your saved algorithm");
});

test("personal palace and memo-story order survive reload without remote requests", async ({ page }) => {
  const external: string[] = [];
  page.on("request",(request) => { if (!request.url().startsWith("data:") && new URL(request.url()).origin !== new URL(process.env.BLD_TEST_URL ?? "http://localhost:3000").origin) external.push(request.url()); });
  await page.goto("/practice/memory/");
  await page.getByLabel("Palace name",{ exact:true }).fill("Test palace");
  await page.getByRole("button",{ name:"Add location",exact:true }).click();
  await page.getByLabel("Location name",{ exact:true }).fill("Desk");
  await page.getByLabel("Reusable image prompt",{ exact:true }).fill("A bright apple on my desk");
  await page.getByRole("button",{ name:"Save palace",exact:true }).click();
  await expect(page.getByRole("button",{ name:"Save palace",exact:true })).toBeEnabled();
  for (const [pair,word] of [["AB","Apple"],["CD","Cat"]]) {
    await page.getByLabel("Letter pair",{ exact:true }).fill(pair);
    await page.getByLabel("Image word or phrase",{ exact:true }).first().fill(word);
    await page.getByRole("button",{ name:"Save pair image",exact:true }).click();
    await expect(page.getByRole("button",{ name:"Save pair image",exact:true })).toBeEnabled();
  }
  await page.getByLabel("Story title",{ exact:true }).fill("Test story");
  await page.getByLabel("Memo pairs (space-separated)",{ exact:true }).fill("AB CD");
  await page.getByRole("button",{ name:"Compose from my images",exact:true }).click();
  await expect(page.locator(".story-scene")).toHaveCount(2);
  await page.getByRole("button",{ name:"Move earlier",exact:true }).last().click();
  await expect(page.locator(".story-scene textarea").first()).toHaveValue("Cat");
  await page.getByRole("button",{ name:"Save story",exact:true }).click();
  await expect(page.getByRole("button",{ name:"Save story",exact:true })).toBeEnabled();
  await page.reload();
  await page.getByText("Saved stories",{ exact:true }).click();
  await page.getByRole("button",{ name:"Test story",exact:true }).click();
  await expect(page.locator(".story-scene textarea").first()).toHaveValue("Cat");
  expect(external).toEqual([]);
});

test("recognition uses native keyboard submission and keeps focus", async ({ page }) => {
  await page.goto("/practice/levels/");
  await expect(page.getByRole("button",{ name:"Check this step",exact:true })).toBeEnabled();
  await page.getByRole("button",{ name:"Show a hint",exact:true }).click();
  const answer = await page.locator(".trainer-surface p.t-notation").last().textContent() ?? "";
  await page.getByLabel("Your answer",{ exact:true }).fill(answer);
  await page.getByLabel("Your answer",{ exact:true }).press("Enter");
  await expect(page.getByText("Verified. Keep going.",{ exact:true })).toBeVisible();
  await expect(page.getByLabel("Your answer",{ exact:true })).toBeFocused();
  await expect(page.locator(".data-table tbody tr").first()).toContainText("1 / 1 correct");
});

test("reference PDF is generated locally with embedded fonts", async ({ page }) => {
  await page.goto("/practice/memory/");
  await page.getByLabel("Letter pair", { exact:true }).fill("AB");
  await page.getByLabel("Image word or phrase", { exact:true }).first().fill("Ångström Éclair");
  await page.getByRole("button", { name:"Save pair image", exact:true }).click();
  await expect(page.getByRole("button", { name:"Save pair image", exact:true })).toBeEnabled();
  await page.goto("/practice/reference/");
  const button = page.getByRole("button",{ name:"Download my PDF",exact:true });
  await expect(button).toBeEnabled();
  const pending = page.waitForEvent("download");
  await button.click();
  const pdf = await pending;
  expect(pdf.suggestedFilename()).toBe("my-blind-reference.pdf");
  await pdf.saveAs(`.artifacts/reference-${test.info().project.name}.pdf`);
  expect(await pdf.failure()).toBeNull();
});

test("custom pair pictures remain local and survive reload", async ({ page }) => {
  await page.goto("/practice/memory/");
  await page.getByLabel("Letter pair",{ exact:true }).fill("AB");
  await page.getByLabel("Image word or phrase",{ exact:true }).first().fill("Apple picture");
  await page.getByLabel("Custom image (PNG, JPEG or WebP)",{ exact:false }).setInputFiles({ name:"apple.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a33sAAAAASUVORK5CYII=","base64") });
  await expect(page.locator("section[aria-label='Your pair images'] img")).toHaveAttribute("src",/^data:image\/png;base64,/);
  await page.getByRole("button",{ name:"Save pair image",exact:true }).click();
  await expect(page.getByRole("button",{ name:"Save pair image",exact:true })).toBeEnabled();
  await page.reload();
  await page.getByLabel("Letter pair",{ exact:true }).fill("AB");
  await expect(page.locator("section[aria-label='Your pair images'] img")).toHaveAttribute("src",/^data:image\/png;base64,/);
});

test("text cube replay changes state one move at a time", async ({ page }) => {
  await page.goto("/settings/");
  await page.getByText("Written out", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Written out", exact: true })).toBeChecked();
  await page.goto("/practice/3style/");
  await page.getByRole("button", { name: "Reveal", exact: true }).click();
  const figure = page.locator(".trainer-stage > .trainer-surface > figure");
  await expect(figure.getByRole("status")).toContainText("Move 0 of");
  const before = await figure.innerText();
  await figure.getByRole("button", { name: "Step forward", exact: true }).click();
  await expect(figure.getByRole("status")).toContainText("Move 1 of");
  expect(await figure.innerText()).not.toBe(before);
  await figure.getByRole("button", { name: "Back to start", exact: true }).click();
  await expect(figure.getByRole("status")).toContainText("Move 0 of");
});

test("missing speech voices leave a visible usable prompt", async ({ page }) => {
  await page.addInitScript(() => {
    if ("speechSynthesis" in window) Object.defineProperty(window.speechSynthesis, "getVoices", { value: () => [] });
  });
  await page.goto("/practice/3style/");
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await expect(page.getByText("No installed English voice is available. Prompts remain visible and screen-reader announcements still work.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal", exact: true })).toBeEnabled();
});

test("native Space activates Reveal once; case-grid arrows do not grade", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Phone uses the touch-friendly case list instead of the desktop grid.");
  await page.goto("/practice/3style/");
  const reveal = page.getByRole("button", { name: "Reveal", exact: true });
  await reveal.focus(); await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "I had it", exact: true })).toBeVisible();
  await page.getByText("Corners cases: first target down the side, second target along the top", { exact: true }).click();
  const button = page.locator("table button[data-cell][tabindex='0']");
  await expect(button).toHaveCount(1); await button.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("table button[data-cell]:focus")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "I had it", exact: true })).toBeVisible();
  await expect(page.getByText("0 of 378 mastered · 0 this session", { exact: true })).toBeVisible();
});

test("verified custom M2 system is built in a responsive worker", async ({ page }) => {
  test.setTimeout(200_000);
  await page.goto("/settings/lettering/");
  const m2 = page.getByRole("combobox", { name: "M2 edges with OP corners", exact: true });
  await expect(m2).toBeVisible();
  const alternative = await m2.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).find((value) => value !== "UBL/DF"));
  expect(alternative).toBeDefined();
  await m2.selectOption(alternative ?? "");
  await expect(page.getByText("Buffers saved.", { exact: true })).toBeVisible();
  await page.goto("/practice/m2op/");
  const settings = page.locator(".trainer-settings summary");
  await settings.click(); await expect(page.locator(".trainer-settings")).toHaveAttribute("open", "");
  await settings.click(); await expect(page.locator(".trainer-settings")).not.toHaveAttribute("open");
  await expect(page.getByRole("button", { name: "Reveal", exact: true })).toBeVisible({ timeout:180_000 });
  await page.goto("/learn/m2-edges/");
  const picker = page.locator("dialog[open]");
  if (await picker.count()) await picker.getByRole("button", { name: /^Plain and precise/ }).click();
  await expect(page.getByText("Your trainers keep your own buffers. This lesson uses the standard teaching system shown here.", { exact: true })).toBeVisible();
});

test("cached workspaces and scramble modules work offline", async ({ page, context }, info) => {
  test.skip(info.project.name === "webkit" || info.project.name === "mobile", "Playwright WebKit's emulated offline networking is not a physical iOS PWA test.");
  await page.goto("/settings/");
  await page.getByRole("button", { name: "Make all lessons available offline", exact:true }).click();
  await page.evaluate(async () => {
    window.dispatchEvent(new Event("bld:prepare-offline"));
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller === null) await new Promise<void>((resolve) => { navigator.serviceWorker.addEventListener("controllerchange", () => { resolve(); }, { once:true }); });
  });
  await context.setOffline(true);
  await page.goto("/practice/first-solve/");
  await expect(page.getByRole("button", { name: "Begin a new solve", exact:true })).toBeEnabled({ timeout:65_000 });
  await context.setOffline(false);
});

test("an available update is discoverable and activates only on request", async ({ page }) => {
  await page.addInitScript(() => {
    const container = new EventTarget();
    const registration = Object.assign(new EventTarget(), {
      active: { state: "activated" }, installing: null,
      waiting: { postMessage: (message: unknown) => { document.documentElement.dataset.updateRequest = JSON.stringify(message); } },
      update: () => Promise.resolve(),
    });
    Object.defineProperty(navigator, "serviceWorker", { value: Object.assign(container, {
      controller: { state: "activated" }, ready: Promise.resolve(registration),
      getRegistration: () => Promise.resolve(registration), register: () => Promise.resolve(registration),
    }) });
  });
  await page.goto("/practice/memory/");
  const notice = page.locator(".update-notice");
  await expect(notice).toBeVisible();
  expect(await page.locator("html").getAttribute("data-update-request")).toBeNull();
  await notice.getByRole("button").last().click();
  await expect(notice).toHaveCount(0);
  expect(await page.locator("html").getAttribute("data-update-request")).toBeNull();
  await page.reload();
  await expect(notice).toBeVisible();
  await notice.getByRole("button").first().click();
  await expect(page.locator("html")).toHaveAttribute("data-update-request", '{"type":"SKIP_WAITING"}');
});

test("a deferred lesson checkpoint becomes usable when reached", async ({ page }) => {
  await page.goto("/settings/");
  await expect(page.getByRole("radio", { name: /Jade lagoon/ })).toBeEnabled();
  const voice = page.getByRole("radio", { name: "Plain and precise", exact: true });
  await voice.locator("..").click();
  await expect(voice).toBeChecked();
  await page.goto("/learn/commutators/");
  const picker = page.locator("dialog[open]");
  if (await picker.count()) await picker.getByRole("button", { name:/^Plain and precise/ }).click();
  const heading = page.getByRole("heading", { name:/^Checkpoint:/ }).first();
  const checkpoint = page.locator("section").filter({ has:heading });
  await expect(async () => {
    await heading.scrollIntoViewIfNeeded();
    await expect(checkpoint.locator("input")).toBeVisible();
  }).toPass({ timeout:15_000 });
  await expect(checkpoint).toContainText("1 of 5");
});
