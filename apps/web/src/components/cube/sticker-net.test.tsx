// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { StickerNet } from "./sticker-net";

it("uses neutral unrevealed stickers instead of leaking their face colour", () => {
  render(<StickerNet label="Recognition cube" cells={[
    { index: 0, slotFace: "U", row: 0, col: 1, colour: "L" },
    { index: 1, slotFace: "F", row: 0, col: 1, colour: "F" },
  ]} highlight={new Set([1])} hideUnrevealed />);
  const fills = [...screen.getByRole("img").querySelectorAll("rect")].map(r => r.getAttribute("fill"));
  expect(fills).toContain("var(--rule)");
  expect(fills).not.toContain("var(--face-l)");
  expect(fills).toContain("var(--face-f)");
});
