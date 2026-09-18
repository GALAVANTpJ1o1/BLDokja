import { describe, expect, it } from "vitest";
import { AccountError, generateRecoveryCode, sha256Hex, USERNAME_INPUT_PATTERN, USERNAME_PATTERN, usernameToEmail } from "./account";

describe("username format", () => {
  it("accepts 3-24 lowercase letters, digits, underscores and hyphens", () => {
    expect(USERNAME_PATTERN.test("abc")).toBe(true);
    expect(USERNAME_PATTERN.test("a_b-9")).toBe(true);
    expect(USERNAME_PATTERN.test("x".repeat(24))).toBe(true);
  });

  it("rejects too short, too long, uppercase, and disallowed characters", () => {
    expect(USERNAME_PATTERN.test("ab")).toBe(false);
    expect(USERNAME_PATTERN.test("x".repeat(25))).toBe(false);
    expect(USERNAME_PATTERN.test("Abc")).toBe(false);
    expect(USERNAME_PATTERN.test("a b")).toBe(false);
    expect(USERNAME_PATTERN.test("a@b")).toBe(false);
    expect(USERNAME_PATTERN.test("")).toBe(false);
  });

  /**
   * An <input pattern> is compiled with the `v` flag and is implicitly anchored, which is exactly
   * what this rebuilds. The obvious spelling of the class -- a bare `-` just before the `]` -- is a
   * syntax error under that flag, and a browser responds by logging and then ignoring the attribute
   * altogether, so the field silently stops validating (docs/DECISIONS.md D-071).
   */
  it("has an input-attribute spelling that a browser can actually compile", () => {
    const asBrowsersCompileIt = new RegExp(`^(?:${USERNAME_INPUT_PATTERN})$`, "v");
    for (const name of ["abc", "a_b-9", "x".repeat(24)]) expect(asBrowsersCompileIt.test(name), name).toBe(true);
    for (const name of ["ab", "x".repeat(25), "Abc", "a b", "a@b", ""]) expect(asBrowsersCompileIt.test(name), name).toBe(false);
  });
});

describe("usernameToEmail", () => {
  it("derives a deterministic synthetic address, lower-cased", () => {
    expect(usernameToEmail("Solver1")).toBe("solver1@accounts.bldokja.internal");
    expect(usernameToEmail("solver1")).toBe(usernameToEmail("Solver1"));
  });
});

describe("generateRecoveryCode", () => {
  it("is 10 characters, from the unambiguous alphabet only, and not the same twice in a row", () => {
    const code = generateRecoveryCode();
    expect(code).toHaveLength(10);
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
    // No 0/O/1/I/L: a human reads this back and types it in, so those pairs must never appear.
    expect(code).not.toMatch(/[01ILO]/);
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
  });
});

describe("sha256Hex", () => {
  it("matches a known SHA-256 digest", async () => {
    // printf '%s' "bldokja" | sha256sum
    expect(await sha256Hex("bldokja")).toBe("1091eeb497cc570ce011b12c515947524bb556e9fdbe85280ba6e8270ccc8556");
  });

  it("is deterministic and case/content sensitive", async () => {
    const a = await sha256Hex("same input");
    const b = await sha256Hex("same input");
    const c = await sha256Hex("different input");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("AccountError", () => {
  it("carries its typed code and a readable message", () => {
    const error = new AccountError("username-taken", "already exists");
    expect(error.code).toBe("username-taken");
    expect(error.message).toBe("already exists");
    expect(error).toBeInstanceOf(Error);
  });
});
