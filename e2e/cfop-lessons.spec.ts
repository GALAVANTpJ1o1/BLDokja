import { expect, test } from "@playwright/test";

test("CFOP notation reviews exact prior moves and saves an independent checkpoint", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/learn/");
  await expect(page.getByRole("heading", { name: "CFOP · sighted solving", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Choose a learning track", exact: true }).getByRole("link", { name: "CFOP · sighted solving", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CFOP · sighted solving", exact: true })).toBeInViewport();
  await page.getByRole("link", { name: "Read the moves before learning CFOP", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Plain and precise/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const explorer = page.getByRole("group", { name: "CFOP face turns: choose a move and inspect its effect", exact: true });
  const firstCube = page.getByRole("img", { name: "CFOP face turns: choose a move and inspect its effect", exact: true });
  await expect(firstCube).toBeVisible();
  await expect(page.locator("twisty-player")).toHaveCount(0);
  const colours = async () => firstCube.locator("rect").evaluateAll(rects => rects.map(rect => rect.getAttribute("fill")));
  const solved = await colours();
  await expect(explorer.getByRole("button", { name: "Previous move", exact: true })).toBeDisabled();
  await explorer.getByRole("button", { name: "R2", exact: true }).click();
  const first = await colours();
  expect(first).not.toEqual(solved);
  await explorer.getByRole("button", { name: "U", exact: true }).click();
  expect(await colours()).not.toEqual(first);
  const back = explorer.getByRole("button", { name: "Previous move", exact: true });
  await back.focus();
  await back.press("Enter");
  expect(await colours()).toEqual(first);
  await back.press("Enter");
  expect(await colours()).toEqual(solved);
  await expect(explorer.getByRole("button", { name: "R", exact: true })).toBeFocused();
  await explorer.getByRole("button", { name: "U2", exact: true }).click();
  await explorer.getByRole("button", { name: "Start over", exact: true }).click();
  expect(await colours()).toEqual(solved);
  await expect(explorer.getByRole("button", { name: "R", exact: true })).toBeFocused();

  const checkpoint = page.locator("section").filter({ has: page.getByRole("heading", { name: "Checkpoint: Reading CFOP notation", exact: true }) });
  await checkpoint.scrollIntoViewIfNeeded();
  const choose = async (answer: string) => {
    const radio = checkpoint.getByLabel(answer, { exact: true });
    await radio.locator("..").click();
    await expect(radio).toBeChecked();
  };
  await choose("Two clockwise turns of F");
  await choose("The same state as R'");
  await choose("M");
  await choose("Always the green face");
  await checkpoint.getByRole("button", { name: "Check answers", exact: true }).click();
  await expect(checkpoint.getByRole("status")).toContainText("0 / 4");
  await checkpoint.getByRole("button", { name: "Try a new set", exact: true }).click();
  await expect(checkpoint.locator('input[type="radio"]:checked')).toHaveCount(0);
  for (const answer of ["A counterclockwise quarter turn, viewed straight at F", "The cube returns to solved", "Rw", "The face now at the front"]) {
    await choose(answer);
  }
  await checkpoint.getByRole("button", { name: "Check answers", exact: true }).click();
  await expect(checkpoint.getByRole("status")).toContainText("Passed with 4 / 4");
  await page.goto("/learn/");
  const row = page.locator("li").filter({ has: page.getByRole("link", { name: "Read the moves before learning CFOP", exact: true }) });
  await expect(row).toContainText("Done");
  const next = page.locator("li").filter({ has: page.getByRole("link", { name: "Beginner F2L — put a pair into its slot", exact: true }) });
  await expect(next).toContainText("Next");
  await page.reload();
  await expect(row).toContainText("Done");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  if (info.project.name === "chromium" || info.project.name === "mobile") {
    await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0); });
    await page.screenshot({ path: `.impeccable/review/cfop-path-${info.project.name}.png`, fullPage: true, scale: "css", animations: "disabled" });
    await page.goto("/learn/cfop-notation/");
    await expect(page.getByRole("img").first()).toBeVisible();
    await page.getByRole("heading", { name: "Checkpoint: Reading CFOP notation", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Check answers", exact: true })).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0); });
    await page.screenshot({ path: `.impeccable/review/cfop-notation-${info.project.name}.png`, fullPage: true, scale: "css", animations: "disabled" });
  }
});

test("paired F2L cubes support forward/back/reset with the same exact state", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/learn/cfop-paired-insertions/");
  await page.getByRole("dialog").getByRole("button", { name: /^Plain and precise/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const labels = [
    "Connected front-right F2L pair: open R, insert with U prime, close R prime",
    "Connected front-right F2L pair from the other side: open F prime, insert U, close F",
  ];
  const completed: (string | null)[][] = [];
  for (const label of labels) {
    const cube = page.getByRole("img", { name: label, exact: true });
    await cube.scrollIntoViewIfNeeded();
    await expect(cube).toBeVisible();
    const colours = async () => cube.locator("rect").evaluateAll(rects => rects.map(rect => rect.getAttribute("fill")));
    const before = await colours();
    const controls = page.getByRole("group", { name: label, exact: true });
    const forward = controls.getByRole("button", { name: "Step forward", exact: true });
    for (let move = 0; move < 3; move += 1) await forward.click();
    await expect(forward).toBeDisabled();
    completed.push(await colours());
    await controls.getByRole("button", { name: "Step back", exact: true }).click();
    await expect(forward).toBeEnabled();
    await controls.getByRole("button", { name: "Back to start", exact: true }).click();
    expect(await colours()).toEqual(before);
  }
  expect(completed[0]).toEqual(completed[1]);
  await expect(page.getByRole("link", { name: "Back to lessons", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  if (info.project.name === "chromium" || info.project.name === "mobile") {
    await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0); });
    await page.screenshot({ path: `.impeccable/review/cfop-f2l-${info.project.name}.png`, fullPage: true, scale: "css", animations: "disabled" });
    if (info.project.name === "chromium") {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { scrollTo(0, 0); });
      await page.screenshot({ path: ".impeccable/review/cfop-f2l-mobile-chromium.png", scale: "css", animations: "disabled" });
    }
  }
});
