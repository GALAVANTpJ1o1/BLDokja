// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { loadPuzzle, stickerName, type Puzzle } from "@bld/cube-engine";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { netCells } from "./cube-state";
import { StickerNet } from "./sticker-net";

afterEach(cleanup);

/** The scramble on the "Tracing a cycle" lesson that showed one lone green sticker and grey centres. */
const SCRAMBLE = "R' B2 R U2 B2 U2 R";

let cube: Puzzle;
beforeAll(async () => {
  cube = await loadPuzzle("3x3x3");
});

const slotNamed = (name: string): number => {
  const found = cube.geometry.stickers.find((s) => stickerName(cube.geometry, s.index) === name);
  if (found === undefined) throw new Error(`no sticker slot named ${name}`);
  return found.index;
};

/** The colour and strength a cell was painted with (its second rect; the first is the cube body behind it). */
function paint(svg: Element, index: number): { fill: string | null | undefined; opacity: string | null | undefined } {
  const cells = Array.from(svg.children).filter((child) => child.tagName === "g" && !child.hasAttribute("data-ring"));
  const sticker = cells[index]?.querySelectorAll("rect")[1];
  return { fill: sticker?.getAttribute("fill"), opacity: sticker?.getAttribute("opacity") };
}

it("uses neutral unrevealed stickers instead of leaking their face colour", () => {
  render(<StickerNet label="Recognition cube" cells={[
    { index: 0, slotFace: "U", row: 0, col: 1, colour: "L", piece: "UL" },
    { index: 1, slotFace: "F", row: 0, col: 1, colour: "F", piece: "UF" },
  ]} highlight={new Set([1])} />);
  const fills = [...screen.getByRole("img").querySelectorAll("rect")].map(r => r.getAttribute("fill"));
  expect(fills).toContain("var(--sticker-off)");
  expect(fills).not.toContain("var(--face-l)");
  expect(fills).toContain("var(--face-f)");
});

describe("a highlighted sticker in the net", () => {
  const cells = () => netCells(cube, cube.kpuzzle.defaultPattern().applyAlg(SCRAMBLE));

  it("brings the rest of its piece in full colour, keeps every centre coloured, and hides everything else (the reported screen)", () => {
    render(<StickerNet label="Cube after the scramble" cells={cells()} highlight={new Set([slotNamed("UBL")])} />);
    const svg = screen.getByRole("img");

    // The buffer piece is green-red-yellow; its three stickers show those colours at full strength.
    expect(paint(svg, slotNamed("UBL"))).toEqual({ fill: "var(--face-f)", opacity: null });
    expect(paint(svg, slotNamed("LUB"))).toEqual({ fill: "var(--face-r)", opacity: null });
    expect(paint(svg, slotNamed("BUL"))).toEqual({ fill: "var(--face-d)", opacity: null });

    // The six centres keep their colour at full strength.
    for (const face of ["U", "L", "F", "R", "B", "D"]) expect(paint(svg, slotNamed(face)), face).toEqual({ fill: `var(--face-${face.toLowerCase()})`, opacity: null });

    // Nothing else gives a colour away.
    const shown = new Set(["UBL", "LUB", "BUL", "U", "L", "F", "R", "B", "D"].map(slotNamed));
    for (const s of cube.geometry.stickers.filter((sticker) => !shown.has(sticker.index))) expect(paint(svg, s.index), stickerName(cube.geometry, s.index)).toEqual({ fill: "var(--sticker-off)", opacity: null });
  });

  it("blacks out the rest instead of dimming its colour, and still never blacks out a centre", () => {
    render(<StickerNet label="Cube after the scramble" cells={cells()} highlight={new Set([slotNamed("UBL")])} />);
    const svg = screen.getByRole("img");
    expect(paint(svg, slotNamed("UFR"))).toEqual({ fill: "var(--sticker-off)", opacity: null });
    for (const face of ["U", "L", "F", "R", "B", "D"]) expect(paint(svg, slotNamed(face)).fill, face).toBe(`var(--face-${face.toLowerCase()})`);
  });

  it("puts a ring on each pointed-at sticker, so the mark does not depend on colour", () => {
    const { container } = render(<StickerNet label="One" cells={cells()} highlight={new Set([slotNamed("UBL")])} />);
    expect(container.querySelectorAll("[data-ring]")).toHaveLength(1);
    cleanup();
    const whole = render(<StickerNet label="Whole piece" cells={cells()} highlight={new Set(["UBL", "LUB", "BUL"].map(slotNamed))} />);
    expect(whole.container.querySelectorAll("[data-ring]")).toHaveLength(3);
  });

  it("draws every sticker normally, with no rings, when nothing is highlighted", () => {
    const { container } = render(<StickerNet label="Plain" cells={cells()} />);
    expect(container.querySelectorAll("[data-ring]")).toHaveLength(0);
    const svg = screen.getByRole("img");
    for (const s of cube.geometry.stickers) {
      const { fill, opacity } = paint(svg, s.index);
      expect(fill, stickerName(cube.geometry, s.index)).not.toBe("var(--sticker-off)");
      expect(opacity, stickerName(cube.geometry, s.index)).toBeNull();
    }
  });
});
