import { describe,it,expect } from "vitest";
import { parseAlg } from "../../src/commutator/parse.js";

describe("untrusted notation budgets", () => {
  it("rejects exponential expansion before allocating moves", () => {
    let text = "R";
    for (let i=0;i<15;i++) text = `[U, ${text}]`;
    const result = parseAlg("3x3x3",text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("complexity-limit");
  });
  it("bounds bracket and implicit-conjugate recursion", () => {
    expect(parseAlg("3x3x3","[R: ".repeat(200)+"U"+"]".repeat(200)).ok).toBe(false);
    expect(parseAlg("3x3x3","R: ".repeat(200)+"U").ok).toBe(false);
  });
});
