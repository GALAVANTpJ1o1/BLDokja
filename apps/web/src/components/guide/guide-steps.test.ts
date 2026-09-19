import { describe, expect, it } from "vitest";
import { neighbour, settle } from "./guide-steps";

const order = ["a", "b", "c", "d", "e"];

describe("settle", () => {
  it("stays on the current step while its element is still there", () => {
    expect(settle(order, ["a", "b", "c"], "b")).toBe("b");
  });

  it("moves forward to the next available step when the current one disappears", () => {
    expect(settle(order, ["a", "d", "e"], "b")).toBe("d");
    expect(settle(order, ["a", "e"], "c")).toBe("e");
  });

  it("falls back to the nearest earlier step when nothing later is left", () => {
    expect(settle(order, ["a", "b"], "d")).toBe("b");
    expect(settle(order, ["a"], "e")).toBe("a");
  });

  it("closes (undefined) when no step is available at all", () => {
    expect(settle(order, [], "c")).toBeUndefined();
  });

  it("starts at the first available step from a step that is not in the guide", () => {
    expect(settle(order, ["c", "d"], "unknown")).toBe("c");
    expect(settle(order, [], "unknown")).toBeUndefined();
  });
});

describe("neighbour", () => {
  it("finds the step either side among those available, and nothing past the ends", () => {
    const available = ["a", "c", "e"];
    expect(neighbour(available, "c", 1)).toBe("e");
    expect(neighbour(available, "c", -1)).toBe("a");
    expect(neighbour(available, "e", 1)).toBeUndefined();
    expect(neighbour(available, "a", -1)).toBeUndefined();
    expect(neighbour(available, "b", 1)).toBeUndefined();
  });
});
