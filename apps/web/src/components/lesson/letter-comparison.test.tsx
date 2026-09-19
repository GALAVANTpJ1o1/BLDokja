// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { compareLetters } from "@/trainers/checkpoint-items";
import { differenceText, LetterComparison } from "./letter-comparison";

afterEach(cleanup);

/** The right answer from the report: ten corner targets. */
const RIGHT = ["A", "P", "X", "V", "F", "D", "C", "K", "S", "K"];

describe("LetterComparison", () => {
  it("sets what was typed against the right letters, with a cross on each one that differs", () => {
    render(<LetterComparison comparison={compareLetters(RIGHT, "A P X V D F C K S K")} />);
    const [first] = screen.getAllByRole("table");
    if (first === undefined) throw new Error("no table");
    const typed = within(first).getByRole("row", { name: /You typed/ });
    const right = within(first).getByRole("row", { name: /Right answer/ });
    // Targets 5 and 6 are swapped (D F for F D): both typed cells carry the cross, and say "wrong" to a screen reader.
    expect(within(typed).getAllByText("✗")).toHaveLength(2);
    expect(within(typed).getAllByText(/\(wrong\)/)).toHaveLength(2);
    expect(within(right).queryByText("✗")).toBeNull();
    expect(typed.textContent).toContain("A");
    expect(right.textContent).toContain("F");
  });

  it("wraps a long memo onto further tables of six targets, keeping the numbering", () => {
    render(<LetterComparison comparison={compareLetters(RIGHT, "A P X V F D C K K S")} />);
    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(2);
    expect(tables[0]?.getAttribute("aria-label")).toMatch(/targets 1 to 6/);
    expect(tables[1]?.getAttribute("aria-label")).toMatch(/targets 7 to 10/);
    const second = tables[1];
    if (second === undefined) throw new Error("no second table");
    expect(within(second).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Target", "7", "8", "9", "10"]);
  });

  it("shows a dash for targets never typed and for letters typed past the end", () => {
    render(<LetterComparison comparison={compareLetters(["A", "P", "X"], "AP")} />);
    expect(screen.getByText("nothing typed")).toBeTruthy();
    cleanup();
    render(<LetterComparison comparison={compareLetters(["A", "P"], "APX")} />);
    expect(screen.getByText("no target")).toBeTruthy();
    expect(screen.getAllByText("✗")).toHaveLength(1);
  });
});

describe("differenceText", () => {
  it("says where a memo first went wrong, with what was typed and what was right", () => {
    expect(differenceText(compareLetters(RIGHT, "A P X C F D C K S K"))).toBe("Not this time. It first goes wrong at target 4: you typed C, the right letter is V.");
  });

  it("says when the answer stopped early, ran on, or was empty", () => {
    expect(differenceText(compareLetters(RIGHT, "A P X"))).toBe("Not this time. You stopped after target 3; target 4 is V.");
    expect(differenceText(compareLetters(["A", "P"], "A P X"))).toBe("Not this time. The right answer ends after target 2; you typed X for target 3.");
    expect(differenceText(compareLetters(["A", "P"], ", ,"))).toBe("Not this time. No letters were typed; target 1 is A.");
  });

  it("gives a single letter question its own plain sentence, and nothing for a right answer", () => {
    expect(differenceText(compareLetters("K", "j"))).toBe("Not this time. You typed J; the right letter is K.");
    expect(differenceText(compareLetters(RIGHT, RIGHT.join(" ")))).toBeUndefined();
  });
});
