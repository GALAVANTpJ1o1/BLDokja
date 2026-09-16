"use client";

import { useEffect, useRef, useState } from "react";
import { polish } from "@/i18n/polish";

/**
 * Registers the service worker that keeps the whole site available offline (BRIEF §10; scripts/sw.mjs
 * writes it after each build). Production builds only: in development it would cache pages that are still
 * changing. A new version installs in the background and takes over once every open tab has closed, so a
 * page never mixes files from two versions.
 */
export function ServiceWorkerRegistration() {
  const [waiting, setWaiting] = useState<ServiceWorker | undefined>();
  const [dismissed, setDismissed] = useState(false);
  const requested = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let lastChecked = Date.now();
    const offer = () => {
      if (!disposed && navigator.serviceWorker.controller !== null && registration?.waiting !== null && registration?.waiting !== undefined) {
        setWaiting(registration.waiting);
        setDismissed(false);
      }
    };
    const installed = () => { offer(); };
    const found = () => { registration?.installing?.addEventListener("statechange", installed); };
    let started = false;
    const prepare = () => {
      if (disposed || started) return;
      started = true;
      window.removeEventListener("pointerdown", prepare);
      window.removeEventListener("keydown", prepare);
      window.removeEventListener("scroll", prepare);
      void navigator.serviceWorker.register("/sw.js").then((registered) => {
        if (disposed) return;
        registration = registered;
        offer(); found();
        registration.addEventListener("updatefound", found);
      }).catch(() => { started = false; });
    };
    const changed = () => { if (requested.current) window.location.reload(); };
    const check = () => {
      if (document.visibilityState === "visible" && Date.now() - lastChecked > 3_600_000) {
        lastChecked = Date.now();
        void registration?.update().catch(() => undefined);
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("bld:prepare-offline", prepare);
    // A returning PWA checks updates immediately. A newcomer doesn't download the entire course
    // while the first page and its cube are still loading. Interaction or Settings starts the pack.
    void navigator.serviceWorker.getRegistration().then((existing) => {
      if (disposed) return;
      if (existing !== undefined) prepare();
      else {
        window.addEventListener("pointerdown", prepare, { once:true });
        window.addEventListener("keydown", prepare, { once:true });
        window.addEventListener("scroll", prepare, { once:true, passive:true });
      }
    }).catch(() => undefined);
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", found);
      registration?.installing?.removeEventListener("statechange", installed);
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("bld:prepare-offline", prepare);
      window.removeEventListener("pointerdown", prepare);
      window.removeEventListener("keydown", prepare);
      window.removeEventListener("scroll", prepare);
    };
  }, []);
  if (waiting === undefined || dismissed) return null;
  return <aside className="update-notice panel p-4" role="status">
    <p className="t-ui">{polish.update.ready}</p>
    <p className="t-meta text-quiet mt-1">{polish.update.note}</p>
    <div className="control-row mt-3">
      <button type="button" className="btn btn-strong" onClick={() => { requested.current = true; waiting.postMessage({ type: "SKIP_WAITING" }); }}>{polish.update.action}</button>
      <button type="button" className="btn" onClick={() => { setDismissed(true); }}>{polish.update.later}</button>
    </div>
  </aside>;
}
