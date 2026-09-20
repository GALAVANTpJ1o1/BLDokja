import { expect, test } from "@playwright/test";

/**
 * A buffer is a piece, and you trace from one of its stickers. The settings let OP and M2 use any sticker of the
 * buffer piece (LUB, the left-face sticker of the UBL corner, instead of UBL), because the engine builds, verifies
 * and solves from each of them (packages/cube-engine/test/methods/buffer-orientation.test.ts).
 */
test("OP and M2 buffers can be another sticker of the same piece, and it is kept", async ({ page }) => {
  await page.goto("/settings/lettering/");
  // The page's own warning for a buffer it cannot verify (Next's route announcer is also an empty role=alert, so match the text).
  const warning = page.getByText("aren't a pair the site can verify");
  const op = page.getByRole("combobox", { name: "Old Pochmann", exact: true });
  await expect(op).toHaveValue("UBL/UR");

  const opStickers = page.getByRole("group", { name: "Old Pochmann: the sticker you trace from", exact: true });
  const corner = opStickers.getByLabel("Corner buffer sticker");
  const edge = opStickers.getByLabel("Edge buffer sticker");
  await expect(corner).toHaveValue("UBL");
  // Each sticker shows its letter, and the standard one is marked.
  await expect(corner.locator("option")).toHaveText(["UBL (A) · standard", "LUB (E)", "BUL (R)"]);
  await expect(edge.locator("option")).toHaveText(["UR (B) · standard", "RU (M)"]);

  await corner.selectOption("LUB");
  await expect(page.getByText("Buffers saved.", { exact: true })).toBeVisible();
  await edge.selectOption("RU");
  // Still the same two pieces, still a system the site can verify: no warning, and the pair list stays on (UBL, UR).
  await expect(warning).toHaveCount(0);
  await expect(op).toHaveValue("UBL/UR");

  const m2Stickers = page.getByRole("group", { name: "M2 edges with OP corners: the sticker you trace from", exact: true });
  await m2Stickers.getByLabel("Corner buffer sticker").selectOption("BUL");
  await expect(warning).toHaveCount(0);

  await page.reload();
  await expect(opStickers.getByLabel("Corner buffer sticker")).toHaveValue("LUB");
  await expect(opStickers.getByLabel("Edge buffer sticker")).toHaveValue("RU");
  await expect(m2Stickers.getByLabel("Corner buffer sticker")).toHaveValue("BUL");
  await expect(warning).toHaveCount(0);

  // Choosing a different pair of pieces starts again from that pair's own reference stickers.
  const other = await op.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).find((value) => value !== "UBL/UR"));
  expect(other).toBeDefined();
  await op.selectOption(other ?? "");
  await expect(op).toHaveValue(other ?? "");
  await expect(opStickers.getByLabel("Corner buffer sticker")).not.toHaveValue("LUB");
});
