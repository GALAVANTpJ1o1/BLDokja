import "fake-indexeddb/auto";
import { Dexie } from "dexie";
import { describe, expect, it } from "vitest";
import { dexieBackend } from "../src/dexie-backend.js";
import { createStorage } from "../src/storage.js";

/**
 * Every real v1 install has a Dexie database at version 1 with exactly the five original stores
 * (backend.ts's COLLECTIONS before "outbox" was added). This simulates that exact on-disk shape --
 * built independently of dexie-backend.ts, the way an old build actually left it -- then opens it
 * through today's dexieBackend() (version 2, six stores) and checks nothing is lost or reset.
 * "Never drop user data silently" (CLAUDE.md) applies to schema upgrades, not just imports.
 */
describe("Dexie version upgrade (v1 install -> v2 outbox store)", () => {
  it("keeps existing records and adds a working outbox store, without wiping the database", async () => {
    const name = "dexie-upgrade-test";

    const v1 = new Dexie(name);
    v1.version(1).stores({ letterPairs: "", events: "", meta: "", tombstones: "", quarantine: "" });
    await v1.open();
    const pair = { id: "AB", first: "A", second: "B", images: [{ id: "img-AB", text: "word", uses: 1 }] };
    const event = { id: "e1", type: "drill.attempt", at: "2026-09-16T01:00:00Z", trainer: "trace", caseId: "M", correct: true, responseMs: 800 };
    await v1.table("letterPairs").put(pair, "AB");
    await v1.table("events").put(event, "e1");
    await v1.table("meta").put({ theme: "dark" }, "settings");
    v1.close();

    const backend = dexieBackend(name);
    const storage = createStorage(backend);

    expect(await storage.letterPair("AB")).toEqual(pair);
    expect((await storage.events()).map((e) => e.id)).toEqual(["e1"]);
    expect(await storage.settings()).toEqual({ theme: "dark" });

    // The new outbox store actually works post-upgrade, not just "opening didn't throw".
    expect(await storage.outbox()).toEqual([]);
    await storage.enqueueOutbox({ id: "event:e1", kind: "event", recordId: "e1", queuedAt: "2026-09-18T00:00:00Z" });
    expect(await storage.outbox()).toEqual([{ id: "event:e1", kind: "event", recordId: "e1", queuedAt: "2026-09-18T00:00:00Z" }]);
    await storage.dequeueOutbox("event:e1");
    expect(await storage.outbox()).toEqual([]);

    backend.close();
    await backend.deleteDatabase();
  });
});
