"use client";

import { useEffect, useState } from "react";
import { polish } from "@/i18n/polish";

export function OfflinePack() {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (!disposed && registration?.active?.state === "activated") setState("ready");
    }).catch(() => { if (!disposed) setState("failed"); });
    return () => { disposed = true; };
  }, []);
  const prepare = async () => {
    if (!("serviceWorker" in navigator)) { setState("failed"); return; }
    setState("loading");
    window.dispatchEvent(new Event("bld:prepare-offline"));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_resolve,reject) => { timer = setTimeout(() => { reject(new Error("offline-timeout")); },90_000); })]);
      setState("ready");
    } catch { setState("failed"); } finally { clearTimeout(timer); }
  };
  return <div className="flex flex-col gap-3">
    <p className="t-meta text-quiet">{polish.offline.intro}</p>
    <button className="btn self-start" type="button" disabled={state === "loading"} onClick={() => { void prepare(); }}>{state === "loading" ? polish.offline.loading : polish.offline.action}</button>
    <p className="t-meta" role="status">{state === "ready" ? polish.offline.ready : state === "failed" ? polish.offline.failed : ""}</p>
  </div>;
}
