"use client";

import type { Palette, Settings, Theme, Voice } from "@bld/storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getStorage, requestPersistentStorage } from "@/lib/storage-client";

/** Mirrors theme and palette for the first paint (see APPEARANCE_BOOT in app/layout.tsx). A convenience only: settings live in storage. */
export const APPEARANCE_KEY = "bld.appearance";

export interface ResolvedSettings {
  readonly theme: Theme;
  readonly palette: Palette;
  readonly voice: Voice | undefined;
  readonly lastBackupAt: string | undefined;
  readonly persistentStorage: Settings["persistentStorage"];
}

interface SettingsContextValue {
  readonly settings: ResolvedSettings;
  /** Everything stored, for the settings that have no default here (scheme, buffers, algs, difficulty). */
  readonly stored: Settings | undefined;
  readonly ready: boolean;
  readonly update: (patch: Partial<Settings>) => Promise<void>;
}

const DEFAULTS: ResolvedSettings = { theme: "system", palette: "standard", voice: undefined, lastBackupAt: undefined, persistentStorage: undefined };

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
    voice: stored?.voice,
    lastBackupAt: stored?.lastBackupAt,
    persistentStorage: stored?.persistentStorage,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Settings | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getStorage()
      .settings()
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

  const update = useCallback(async (patch: Partial<Settings>) => {
    const storage = getStorage();
    const next = await storage.transaction(async (tx) => {
      const merged: Settings = { ...(await tx.settings()), ...patch };
      await tx.putSettings(merged);
      return merged;
    });
    setStored(next);
    // Ask for persistent storage the first time anything is saved (your 2026-09-15 answer).
    if (next.persistentStorage === undefined) {
      const persistentStorage = await requestPersistentStorage();
      const withStatus: Settings = { ...next, persistentStorage };
      await storage.putSettings(withStatus);
      setStored(withStatus);
    }
  }, []);

  const value = useMemo(() => ({ settings, stored, ready, update }), [settings, stored, ready, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === undefined) throw new Error("useSettings needs a SettingsProvider");
  return value;
}
