import { afterEach, describe, expect, it } from "vitest";
import { ALL_GUIDES, forgetRemembered, hasSeen, markSeen, readSeen, type GuideStorage } from "./guide-storage";

function memoryStorage(initial: Record<string, string> = {}): GuideStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

afterEach(forgetRemembered);

describe("page guide seen-state", () => {
  it("has seen nothing at first, then the guide it was told about, at that version and below", () => {
    const storage = memoryStorage();
    expect(hasSeen("home", 1, storage)).toBe(false);
    markSeen("home", 2, storage);
    expect(hasSeen("home", 1, storage)).toBe(true);
    expect(hasSeen("home", 2, storage)).toBe(true);
    // A new version of the guide is worth showing again.
    expect(hasSeen("home", 3, storage)).toBe(false);
    expect(hasSeen("practice", 1, storage)).toBe(false);
  });

  it("keeps each guide separately and never writes a lower version than it already holds", () => {
    const storage = memoryStorage();
    markSeen("home", 3, storage);
    markSeen("practice", 1, storage);
    markSeen("home", 1, storage);
    expect(readSeen(storage)).toEqual({ home: 3, practice: 1 });
    // What is persisted, not only what this page load remembers: after a reload the version 3 mark must survive.
    expect(JSON.parse(storage.data["bld.guides.seen"] ?? "{}")).toEqual({ home: 3, practice: 1 });
    forgetRemembered();
    expect(hasSeen("home", 3, storage)).toBe(true);
  });

  it("ignores stored data that is not the shape it wrote", () => {
    for (const junk of ["not json", "[1,2]", '{"home":"yes"}', '{"home":-1}', '{"home":1.5}', "null"]) {
      expect(readSeen(memoryStorage({ "bld.guides.seen": junk })), junk).toEqual({});
    }
  });

  it("still shows each guide only once when storage refuses to save", () => {
    const refusing: GuideStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(hasSeen("home", 1, refusing)).toBe(false);
    markSeen("home", 1, refusing);
    expect(hasSeen("home", 1, refusing)).toBe(true);
  });

  it("treats the wildcard as every guide seen, at any version up to its own", () => {
    const storage = memoryStorage({ "bld.guides.seen": JSON.stringify({ [ALL_GUIDES]: 5 }) });
    expect(hasSeen("home", 1, storage)).toBe(true);
    expect(hasSeen("anything-else", 5, storage)).toBe(true);
    expect(hasSeen("home", 6, storage)).toBe(false);
  });

  it("works with no storage at all", () => {
    markSeen("home", 1, undefined);
    expect(readSeen(undefined)).toEqual({ home: 1 });
  });
});
