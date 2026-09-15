import { describe, it } from "vitest";
import { expectComplete } from "./comm-oracle.js";

describe("comm search completeness (full)", () => {
  it.each(["UFR", "UBL", "FDR"])("matches the oracle on every corner case for %s", async (buffer) => {
    await expectComplete("corners", buffer, "all");
  });

  it.each(["UF", "DF"])("matches the oracle on 12 seeded edge cases for %s", async (buffer) => {
    await expectComplete("edges", buffer, 12);
  });
});
