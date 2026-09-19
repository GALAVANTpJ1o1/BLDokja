import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The CFOP polishing pass in a real browser (polish brief §75-77): reference pages as cards, F2L practice and lesson
 * exercises judged by cube state (including a solution other than the reference), last-layer recognition with aliases,
 * teaching feedback and chained stages, statistics that persist, one-handed algorithms, orientation profiles and layout.
 */

const pressMoves = async (_page: Page, group: Locator, moves: string) => {
  for (const move of moves.split(" ")) await group.getByRole("button", { name: move, exact: true }).click();
};

test.describe("reference pages are cards, not tables", () => {
  test("full OLL: 57 cards, meaningful names, search in plain words, one-handed rows, no internal ids", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/reference/oll/");
    await expect(page.locator("article.case-card")).toHaveCount(57);
    await expect(page.getByRole("heading", { name: "OLL 27 — Sune", exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/oll[-_]\d\d|pll[-_]\d\d|eo-\d|co-\d/);
    await expect(page.locator("table")).toHaveCount(0);
    await page.getByLabel("Search by name, number or shape").fill("fish");
    await expect(page.locator("article.case-card")).toHaveCount(4);
    await page.getByLabel("Search by name, number or shape").fill("27");
    await expect(page.getByRole("heading", { name: "OLL 27 — Sune", exact: true })).toBeVisible();
    await page.getByLabel("Search by name, number or shape").fill("");
    const four = page.locator('article[data-case-id="oll_04"] code').first();
    const twoHanded = await four.innerText();
    await page.getByRole("button", { name: "One-handed", exact: true }).click();
    await expect(four).not.toHaveText(twoHanded);
    // OLL 43 is one case where the one-handed algorithm is the two-handed one, and it still has its own row.
    await expect(page.locator('article[data-case-id="oll_43"] code').first()).toHaveText("F' U' L' U L F");
    await expect(page.locator('article[data-case-id="oll_43"]')).not.toContainText("No one-handed row was supplied");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("full PLL, 2-look and F2L sheets have exactly the sets the brief asks for", async ({ page }) => {
    for (const [route, count] of [["/reference/pll/", 21], ["/reference/2look-oll/", 10], ["/reference/2look-pll/", 6], ["/reference/f2l/", 41]] as const) {
      await page.goto(route);
      await expect(page.locator("article.case-card"), route).toHaveCount(count);
    }
  });

  test("a PLL card explains what to look for and how to hold it, and the cube plays on demand", async ({ page }) => {
    await page.goto("/reference/pll/");
    const card = page.locator('article[data-case-id="pll_t"]');
    await expect(card).toContainText("What to look for");
    await expect(card).toContainText("How to hold it");
    await expect(card).toContainText("Yellow on top");
    await expect(card.locator("twisty-player")).toHaveCount(0);
    await card.getByRole("button", { name: "Watch it solve" }).click();
    await expect(card.getByRole("button", { name: "Step forward" })).toBeVisible();
    await expect(card.locator("twisty-player, svg[role='img']").first()).toBeVisible();
  });

  test("two-handed and one-handed algorithms differ where they should", async ({ page }) => {
    await page.goto("/reference/pll/");
    const aa = page.locator('article[data-case-id="pll_aa"] code').first();
    await page.getByRole("button", { name: "Two-handed", exact: true }).click();
    await expect(aa).toHaveText("x L2 D2 L' U' L D2 L' U L'");
    await page.getByRole("button", { name: "One-handed", exact: true }).click();
    await expect(aa).toHaveText("x R' U R' D2 R U' R' D2 R2");
    await page.reload();
    await expect(page.locator('article[data-case-id="pll_aa"] code').first()).toHaveText("x R' U R' D2 R U' R' D2 R2");
  });

  test("a learning status set by hand is kept and wins over practice", async ({ page }) => {
    await page.goto("/reference/2look-oll/");
    const card = page.locator('article[data-case-id="co_sune"]');
    await card.getByLabel("Your status").selectOption("learned");
    await expect(card).toHaveAttribute("data-status", "learned");
    await page.reload();
    await expect(page.locator('article[data-case-id="co_sune"]')).toHaveAttribute("data-status", "learned");
    await page.locator('article[data-case-id="co_sune"]').getByLabel("Your status").selectOption("auto");
    await expect(page.locator('article[data-case-id="co_sune"]')).toHaveAttribute("data-status", "unlearned");
  });
});

test.describe("orientation profiles", () => {
  test("CFOP pages show yellow on top and a white cross; blindfolded lessons keep white on top", async ({ page }) => {
    await page.goto("/reference/oll/");
    const cfopTop = await page.evaluate(() => getComputedStyle(document.querySelector(".profile-scope") ?? document.body).getPropertyValue("--face-u").trim().toUpperCase());
    const cfopBottom = await page.evaluate(() => getComputedStyle(document.querySelector(".profile-scope") ?? document.body).getPropertyValue("--face-d").trim().toUpperCase());
    expect(cfopTop).toBe("#FFD23F");
    expect(cfopBottom).toBe("#F4F4F1");
    await page.goto("/learn/cfop-paired-insertions/");
    await expect(page.locator("html")).toHaveAttribute("data-cube-profile", "CFOP");
    await page.goto("/learn/notation/");
    await expect(page.locator("html")).not.toHaveAttribute("data-cube-profile", /.+/);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--face-u"))).toBe("");
  });
});

test.describe("F2L", () => {
  test("lesson exercises are solved with real turns, judged by the cube, and pass the checkpoint", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/learn/cfop-pairing-extraction/");
    const pads = page.getByRole("group", { name: "Turn buttons" });
    await expect(pads).toHaveCount(3);
    await expect(page.getByText("0 / 3")).toBeVisible();
    // Hints get stronger one at a time; the third names a first turn.
    const board = page.locator("[data-guide='f2l-board']").first();
    await board.getByRole("button", { name: "Hint", exact: true }).click();
    await expect(board.locator("ol.feedback li")).toHaveCount(1);
    await board.getByRole("button", { name: "Hint 2", exact: true }).click();
    await board.getByRole("button", { name: "Hint 3", exact: true }).click();
    await expect(board.locator("ol.feedback li").nth(2)).toContainText("Try starting with");
    await pressMoves(page, pads.nth(0), "R U' R'");
    await expect(page.getByText(/Solved in 3 moves/).first()).toBeVisible();
    await expect(page.getByText("1 / 3")).toBeVisible();
    await pressMoves(page, pads.nth(1), "U R U2 R' U R U' R'");
    // The pass is written to storage a moment after the third solve, and the page announces it with `bld:progress`.
    // Leaving before that would abandon the write, so wait for it.
    const saved = page.evaluate(() => new Promise<void>((resolve) => { window.addEventListener("bld:progress", () => { resolve(); }, { once: true }); }));
    await pressMoves(page, pads.nth(2), "U' R U R' U' R U R'");
    await expect(page.getByText("3 / 3")).toBeVisible();
    await saved;
    await page.goto("/learn/");
    await expect(page.locator("li").filter({ has: page.getByRole("link", { name: /Beginner F2L — turn an awkward pair/ }) })).toContainText("Done");
    expect(errors).toEqual([]);
  });

  test("F2L practice accepts a different valid solution, not just the reference", async ({ page }) => {
    await page.goto("/practice/f2l/?case=35");
    await expect(page.getByText("This is F2L case 35.")).toBeVisible();
    const pad = page.getByRole("group", { name: "Turn buttons" });
    // Case 35 has more than one four-turn solution. Whatever the random top-layer turn is, the sledgehammer R' F R F' solves it after
    // the right U turn; the page must accept it because the cube says so.
    let solved = false;
    for (const auf of ["", "U", "U'", "U2"]) {
      if (auf !== "") await pad.getByRole("button", { name: auf, exact: true }).click();
      await pressMoves(page, pad, "R' F R F'");
      if (await page.getByText(/Solved in 4\+? moves|Solved in \d+ moves/).first().isVisible().catch(() => false)) { solved = true; break; }
      await page.getByRole("button", { name: "Reset" }).click();
    }
    expect(solved).toBe(true);
    await expect(page.getByText("Any solution that leaves the cross")).toBeVisible();
  });

  test("F2L practice has four levels, only U R L F turns, and records what you did", async ({ page }) => {
    await page.goto("/practice/f2l/");
    await expect(page.getByRole("button", { name: /Level 4/ })).toBeVisible();
    const pad = page.getByRole("group", { name: "Turn buttons" });
    for (const forbidden of ["D", "B", "M", "x", "y"]) await expect(pad.getByRole("button", { name: forbidden, exact: true })).toHaveCount(0);
    await expect(pad.getByRole("button")).toHaveCount(12);
    for (const level of [2, 3, 4]) {
      await page.getByRole("button", { name: new RegExp(`Level ${String(level)}`) }).click();
      await expect(page.getByRole("group", { name: "Turn buttons" })).toBeVisible();
    }
    await page.getByRole("button", { name: /Level 1/ }).click();
    await page.getByRole("button", { name: "Show a solution" }).click();
    await expect(page.getByText("One efficient way:")).toBeVisible();
    await page.getByRole("button", { name: "Next case" }).click();
    await page.goto("/practice/f2l/");
    await expect(page.getByRole("heading", { name: "Your F2L practice" })).toBeVisible();
    await expect(page.getByText("Cases tried")).toBeVisible();
  });
});

test.describe("last-layer recognition", () => {
  const ask = async (page: Page) => {
    for (let i = 0; i < 3; i += 1) await page.locator("form button").filter({ hasText: /^Hint/ }).click();
    const text = await page.locator("ol.feedback li").nth(2).innerText();
    return /It is (.+)\.$/.exec(text.trim())?.[1] ?? "";
  };

  test("every mode is offered, and a stage runs: timed answer, teaching feedback, algorithm, next stage on the same cube", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/practice/last-layer/?mode=2look-ll&length=1");
    await expect(page.locator(".mode-grid button > span:first-child")).toHaveText(["2-look OLL", "2-look PLL", "2-look last layer", "1-look OLL", "1-look PLL", "2-look OLL + 1-look PLL", "1-look OLL + 1-look PLL"]);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText(/Edge orientation · stage 1 of 4/)).toBeVisible();
    await expect(page.getByLabel("Which case is this?")).toBeFocused();
    // A wrong answer teaches: it names the case, keeps it on screen, shows the clue and the algorithm.
    await page.getByLabel("Which case is this?").fill("not a case");
    await page.getByLabel("Which case is this?").press("Enter");
    const feedback = page.locator(".feedback[role='alert']");
    await expect(feedback).toContainText("is not a case in this stage");
    await expect(feedback).toContainText("This is");
    await expect(feedback).toContainText("Algorithm");
    await expect(feedback).toContainText("Recognition time");
    await expect(page.locator(".recognition-stage svg[role='img']")).toBeVisible();
    await page.getByRole("button", { name: "Got it, continue" }).click();
    // The next stage is the state that algorithm left, and it is a different stage of the mode.
    await expect(page.getByText(/(Corner orientation|Corner permutation|Edge permutation).*stage \d of 4/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("aliases and formatting never make a correct answer wrong; recognition time and stats persist", async ({ page }) => {
    await page.goto("/practice/last-layer/?mode=1look-pll&length=1");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const name = await ask(page); // e.g. "Ja perm"
    expect(name).not.toBe("");
    const messy = ` ${name.toUpperCase().split("").join("")}  `.replace("PERM", "-perm");
    await page.getByLabel("Which case is this?").fill(messy);
    await page.getByLabel("Which case is this?").press("Enter");
    await expect(page.locator(".feedback[role='status']").first()).toContainText("Correct");
    await expect(page.locator(".feedback").first()).toContainText("Recognition time");
    await page.getByRole("button", { name: "Continue" }).click();
    // One case per session: the session review follows, with a way back to weak cases.
    await expect(page.getByRole("heading", { name: "Session review" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Practise weak cases" })).toBeVisible();
    await page.goto("/practice/last-layer/");
    await expect(page.getByRole("heading", { name: "Your recognition record" })).toBeVisible();
    await expect(page.locator("table.stat-table tbody tr")).toHaveCount(1);
    await page.goto("/progress/");
    await expect(page.getByRole("heading", { name: "CFOP progress" })).toBeVisible();
    await expect(page.getByText(/Recognition accuracy: 100%/)).toBeVisible();
  });

  test("a mixed mode plays OLL then PLL on one cube", async ({ page }) => {
    await page.goto("/practice/last-layer/?mode=1look-oll%2B1look-pll&length=1");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText(/OLL · stage 1 of 2/)).toBeVisible();
    const name = await ask(page);
    await page.getByLabel("Which case is this?").fill(name);
    await page.getByLabel("Which case is this?").press("Enter");
    await expect(page.locator(".feedback").first()).toContainText("Correct");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/PLL · stage 2 of 2/)).toBeVisible();
  });
});

test.describe("hubs and orientation", () => {
  test("Learn offers three paths, CFOP is grouped in order with direct practice links; Practice is grouped by skill", async ({ page }) => {
    await page.goto("/learn/");
    for (const name of ["Blindfolded", "CFOP", "One-handed", "Practice"]) await expect(page.locator("a.path-card").filter({ hasText: name }).first()).toBeVisible();
    for (const group of ["Notation", "F2L", "2-look last layer", "Advanced F2L", "Full OLL and PLL"]) await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Practise F2L" })).toBeVisible();
    await page.goto("/practice/");
    for (const group of ["F2L", "Last layer", "Blindfolded", "Memory and recognition", "Reference"]) await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Pick a path" })).toBeVisible();
  });

  test("no voice picker appears in a CFOP lesson, and lessons link straight to their practice and cheat sheet", async ({ page }) => {
    await page.goto("/learn/cfop-full-pll/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Practise recognition" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the complete cheat sheet" }).first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/pll-\d\d/);
  });
});

test.describe("layout", () => {
  test("nothing overflows sideways and touch targets are usable at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    for (const route of ["/reference/oll/", "/reference/pll/", "/reference/f2l/", "/practice/f2l/", "/practice/last-layer/", "/learn/cfop-advanced-intuitive-f2l/", "/practice/"]) {
      await page.goto(route);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), route).toBeLessThanOrEqual(1);
    }
    await page.goto("/practice/f2l/");
    const pad = page.getByRole("group", { name: "Turn buttons" });
    const box = await pad.getByRole("button", { name: "R", exact: true }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
