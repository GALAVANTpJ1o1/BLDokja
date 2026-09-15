"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that keeps the whole site available offline (BRIEF §10; scripts/sw.mjs
 * writes it after each build). Production builds only: in development it would cache pages that are still
 * changing. A new version installs in the background and takes over once every open tab has closed, so a
 * page never mixes files from two versions.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is an extra; the site works without it.
    });
  }, []);
  return null;
}
