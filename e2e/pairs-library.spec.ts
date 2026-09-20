import { expect, test, type Page } from "@playwright/test";

/**
 * The letter-pair library's 24 x 24 grid is wider than the screen. Two things the owner asked for:
 * an open-hand cursor with click-and-drag scrolling (so nobody travels to the bottom for the scrollbar), and a way
 * to put a picture on a pair image, not just a word.
 */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function openGrid(page: Page): Promise<void> {
  await page.goto("/practice/pairs/");
  await expect(page.locator("table button[data-cell]").first()).toBeVisible();
}

test.describe("letter library on a wide screen", () => {
  test("shows an open hand, scrolls sideways when dragged, and still opens a cell on a plain click", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "The 24 x 24 grid is for wide screens; a phone lists pairs by first letter.");
    await openGrid(page);
    const scroller = page.locator(".drag-scroll");
    expect(await scroller.evaluate((el) => getComputedStyle(el).cursor)).toBe("grab");
    expect(await scroller.locator("button[data-cell]").first().evaluate((el) => getComputedStyle(el).cursor)).toBe("grab");
    expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await scroller.evaluate((el) => el.scrollLeft)).toBe(0);

    const box = await scroller.boundingBox();
    if (box === null) throw new Error("no grid");
    const y = box.y + 80;
    await page.mouse.move(box.x + box.width - 60, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 200, y, { steps: 6 });
    // While held, the hand is closed.
    expect(await scroller.evaluate((el) => getComputedStyle(el).cursor)).toBe("grabbing");
    await page.mouse.move(box.x + 40, y, { steps: 8 });
    await page.mouse.up();
    expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(200);
    // Letting go over a cell after a drag must not open it.
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    expect(await scroller.evaluate((el) => getComputedStyle(el).cursor)).toBe("grab");

    // A plain click, no movement, still opens the pair.
    await page.locator("table button[data-cell]").nth(30).click();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
  });

  test("a picture can be added to a pair's image, kept after a reload, shown in the grid, and removed", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "The 24 x 24 grid is for wide screens; a phone lists pairs by first letter.");
    await openGrid(page);
    await page.locator("table button[data-cell]").first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Add an image").first().fill("Apple");
    await dialog.getByRole("button", { name: "Add an image" }).click();

    // A file that is not a picture is refused, with a reason, and nothing changes.
    const picker = dialog.getByLabel("Add a picture for Apple");
    await picker.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a picture") });
    await expect(dialog.getByRole("alert")).toContainText("Choose a PNG, JPEG or WebP picture under 2 MB");
    await expect(dialog.getByRole("img")).toHaveCount(0);

    await picker.setInputFiles({ name: "apple.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog.getByRole("img", { name: "Your picture for Apple" })).toBeVisible();
    await expect(dialog.getByLabel("Change the picture for Apple")).toBeVisible();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    // Saved: the grid cell carries a thumbnail, and it is still there after a reload.
    await expect(page.locator("table button[data-cell]").first().locator("img")).toHaveCount(1);
    await page.reload();
    await page.locator("table button[data-cell]").first().click();
    await expect(page.locator("dialog[open]").getByRole("img", { name: "Your picture for Apple" })).toBeVisible();

    await page.locator("dialog[open]").getByRole("button", { name: "Remove picture: Apple" }).click();
    await expect(page.locator("dialog[open]").getByRole("img")).toHaveCount(0);
    await page.locator("dialog[open]").getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("table button[data-cell]").first().locator("img")).toHaveCount(0);
  });
});
