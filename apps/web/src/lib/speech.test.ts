import { describe, expect, it } from "vitest";
import { announcement } from "./speech";

describe("announcements", () => {
  it("joins the parts that are there, so a voice pauses between them", () => {
    expect(announcement(["Target 3 of 12", undefined, "Say the comm", "   "])).toBe("Target 3 of 12. Say the comm");
    expect(announcement([undefined, ""])).toBe("");
  });
});
