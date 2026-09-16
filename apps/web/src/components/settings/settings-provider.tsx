"use client";

import type { CubeView, Palette, Settings, Theme, Voice } from "@bld/storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Storage (Dexie and the Zod schemas) loads after the page has painted: the provider sits in the root
 * layout, so a static import would put it in every page's first download. Pages that use storage import
 * it themselves anyway.
 */
const storageClient = () => import("@/lib/storage-client");

/** Mirrors theme and palette for the first paint (read by public/appearance-boot.js). A convenience only: settings live in storage. */
export const APPEARANCE_KEY = "bld.appearance";

export interface ResolvedSettings {
  readonly theme: Theme;
  readonly palette: Palette;
  readonly cubeView: CubeView;
  readonly readAloud: boolean;
  readonly voice: Voice | undefined;
  readonly lastBackupAt: string | undefined;
  readonly persistentStorage: Settings["persistentStorage"];
}

interface SettingsContextValue {
  /** Session-only consent to load 3D on teaching/practice pages. */
  readonly threeDRequested: boolean;
  readonly request3D: () => void;
  readonly settings: ResolvedSettings;
  /** Everything stored, for the settings that have no default here (scheme, buffers, algs, difficulty). */
  readonly stored: Settings | undefined;
  readonly ready: boolean;
  readonly update: (patch: Partial<Settings>) => Promise<void>;
}

const DEFAULTS: ResolvedSettings = { theme: "system", palette: "standard", cubeView: "3d", readAloud: false, voice: undefined, lastBackupAt: undefined, persistentStorage: undefined };

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

function applyAppearance(settings: ResolvedSettings): void {
  const root = document.documentElement;
  if (settings.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  if (settings.palette === "standard") delete root.dataset.palette;
  else root.dataset.palette = settings.palette;
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme: settings.theme, palette: settings.palette }));
  } catch {
    // Storage blocked: the stored settings still apply once loaded.
  }
}

function resolve(stored: Settings | undefined): ResolvedSettings {
  return {
    theme: stored?.theme ?? DEFAULTS.theme,
    palette: stored?.palette ?? DEFAULTS.palette,
    cubeView: stored?.cubeView ?? DEFAULTS.cubeView,
    readAloud: stored?.readAloud ?? DEFAULTS.readAloud,
    voice: stored?.voice,
    lastBackupAt: stored?.lastBackupAt,
    persistentStorage: stored?.persistentStorage,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Settings | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [threeDRequested, setThreeDRequested] = useState(false);
  const request3D = useCallback(() => { setThreeDRequested(true); }, []);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const persistentRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void storageClient()
      .then((m) => m.getStorage().settings())
      .then((value) => {
        if (cancelled) return;
        setStored(value);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const settings = useMemo(() => resolve(stored), [stored]);

  useEffect(() => {
    if (ready) applyAppearance(settings);
  }, [ready, settings]);

  const update = useCallback((patch: Partial<Settings>): Promise<void> => {
    const save = async () => {
    const { getStorage, requestPersistentStorage } = await storageClient();
    const storage = getStorage();
    const next = await storage.transaction(async (tx) => {
      const merged: Settings = { ...(await tx.settings()), ...patch };
      await tx.putSettings(merged);
      return merged;
    });
    setStored(next);
    // Ask for persistent storage the first time anything is saved (your 2026-09-15 answer).
    if (next.persistentStorage === undefined && !persistentRequested.current) {
      persistentRequested.current = true;
      // Firefox can keep its permission request pending. Saving never waits for that prompt.
      void requestPersistentStorage().then((persistentStorage) => {
        const saveStatus = async () => {
          const withStatus = await storage.transaction(async (tx) => {
            const latest: Settings = { ...(await tx.settings()), persistentStorage };
            await tx.putSettings(latest);
            return latest;
          });
          setStored(withStatus);
        };
        const savedStatus = writes.current.catch(() => undefined).then(saveStatus);
        writes.current = savedStatus;
        return savedStatus;
      }).catch(() => undefined);
    }
    };
    const saved = writes.current.catch(() => undefined).then(save);
    writes.current = saved;
    return saved;
  }, []);

  const value = useMemo(() => ({ settings, stored, ready, update, threeDRequested, request3D }), [settings, stored, ready, update, threeDRequested, request3D]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === undefined) throw new Error("useSettings needs a SettingsProvider");
  return value;
}
