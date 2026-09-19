import { expect, test, type Page } from "@playwright/test";

/**
 * Two things learners reported (docs/DECISIONS.md D-077), checked in a real browser because the 3D half
 * cannot be reached from jsdom:
 *
 * 1. A highlighted corner used to show ONE colour, and the centres went grey. One colour of a corner fits
 *    four positions, so "where does it belong?" could not be answered. Now the whole piece is lit and the
 *    six fixed centres always keep their colour, in the net and in the 3D player.
 * 2. A wrong memo showed only the right answer. Now it shows what was typed against the right letters,
 *    target by target, and where it first went wrong.
 *
 * No backend needed: runs against a plain `pnpm dev` or the live site.
 */

const LESSON = "/learn/cycle-breaks/";
/** The lesson scramble that showed one lone green sticker and grey centres. */
const NET_NAME = /Trace the corners through a break\. Scramble: R' B2 R U2 B2 U2 R/;

async function figureFor(page: Page) {
  await page.goto(LESSON);
  const net = page.getByRole("img", { name: NET_NAME });
  await expect(net).toBeVisible();
  return { net, figure: page.locator("figure", { has: net }) };
}

test("the tracing lesson lights all three colours of the buffer corner and never fades a centre (net)", async ({ page }) => {
  const { net } = await figureFor(page);
  const painted = await net.evaluate((svg) =>
    Array.from(svg.children)
      .filter((child) => child.tagName.toLowerCase() === "g" && !child.hasAttribute("data-ring"))
      .map((cell) => Array.from(cell.querySelectorAll("rect")).at(1)?.getAttribute("opacity")),
  );
  expect(painted).toHaveLength(54);
  // Full strength: the buffer corner's three stickers and the six centres. Everything else is faded.
  expect(painted.filter((opacity) => opacity === "1")).toHaveLength(9);
  expect(painted.filter((opacity) => opacity === "0.28")).toHaveLength(45);
  // The sticker being asked about carries a ring, so it is marked by shape and not by colour alone.
  await expect(net.locator("[data-ring]")).toHaveCount(1);
});

test("the 3D player lights the same nine stickers: the buffer corner's three and all six centres", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "3D scene inspection runs on Chromium only");
  const { figure } = await figureFor(page);
  await figure.getByRole("button", { name: "Inspect in 3D" }).click();
  const player = figure.locator("twisty-player");
  await expect(player).toBeVisible({ timeout: 30_000 });

  // cubing.js keeps one entry per (orbit, orientation, piece) with the colour it drew and the colour it
  // was asked to draw: they match exactly where the mask says "regular". Pinned to the cubing version in
  // use; if this shape changes the message says so instead of failing obscurely.
  const litCount = () =>
    player.evaluate(async (element) => {
      interface Sticker { readonly origColor: number; readonly origColorStickeringMask: number }
      const scene = await (element as unknown as { experimentalCurrentThreeJSPuzzleObject(): Promise<{ stickers?: Record<string, Sticker[][]> }> }).experimentalCurrentThreeJSPuzzleObject();
      if (scene.stickers === undefined) throw new Error("cubing.js no longer exposes puzzle.stickers: update this check for the new version");
      const lit: Record<string, number> = {};
      for (const [orbit, byOrientation] of Object.entries(scene.stickers)) {
        lit[orbit] = byOrientation.flat().filter((s) => s.origColorStickeringMask === s.origColor).length;
      }
      return lit;
    });
  await expect.poll(litCount, { timeout: 30_000 }).toEqual({ CORNERS: 3, EDGES: 0, CENTERS: 24 });
});

test("a wrong letter in the guided trace says what was typed as well as what was right", async ({ page }) => {
  await page.goto(LESSON);
  const input = page.getByLabel("Target 1").first();
  await input.fill("z");
  await input.press("Enter");
  await expect(page.getByText(/you typed Z/i).first()).toBeVisible();
});

test("a wrong memo at the checkpoint is set against the right letters, target by target", async ({ page }) => {
  await page.goto("/learn/memo-time/");
  const checkpoint = page.getByRole("region", { name: /Checkpoint: / }).first();
  const input = checkpoint.getByLabel("Letters");
  await input.fill("zzz");
  await checkpoint.getByRole("button", { name: "Check", exact: true }).click();

  await expect(checkpoint.getByText(/It first goes wrong at target 1: you typed Z, the right letter is [A-X]/)).toBeVisible();
  const table = checkpoint.getByRole("table", { name: /Your letters set against the right ones/ }).first();
  await expect(table.getByRole("row", { name: /You typed/ })).toContainText("Z");
  await expect(table.getByRole("row", { name: /Right answer/ })).toBeVisible();
  // A cross marks each letter that differs, so the difference doesn't rest on colour.
  await expect(table.getByText("✗").first()).toBeVisible();
});
