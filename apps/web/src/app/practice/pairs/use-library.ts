"use client";

import type { LetterPair } from "@bld/storage";
import { useCallback, useEffect, useState } from "react";
import { getStorage } from "@/lib/storage-client";

/**
 * Your letter pairs, loaded once, with a `save` that writes changed pairs in one transaction (so a bulk
 * edit lands whole or not at all) and then updates the local copy. Storage validates every record.
 */
export function useLibrary(): { pairs: readonly LetterPair[] | undefined; save: (changed: readonly LetterPair[]) => Promise<boolean> } {
  const [pairs, setPairs] = useState<readonly LetterPair[] | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void getStorage()
      .letterPairs()
      .then((loaded) => {
        if (!cancelled) setPairs(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const save = useCallback(async (changed: readonly LetterPair[]) => {
    if (changed.length === 0) return true;
    try {
      await getStorage().transaction(async (tx) => {
        for (const pair of changed) await tx.putLetterPair(pair);
      });
    } catch {
      return false;
    }
    const byId = new Map(changed.map((p) => [p.id, p]));
    setPairs((current) => {
      const kept = (current ?? []).map((p) => byId.get(p.id) ?? p);
      const known = new Set(kept.map((p) => p.id));
      return [...kept, ...changed.filter((p) => !known.has(p.id))];
    });
    return true;
  }, []);
  return { pairs, save };
}
