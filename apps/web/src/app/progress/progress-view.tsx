"use client";

import { useEffect, useState } from "react";
import { en } from "@/i18n/en";
import { getStorage } from "@/lib/storage-client";

export function ProgressView() {
  const [count, setCount] = useState<number | undefined>(undefined);
  useEffect(() => {
    void getStorage()
      .events({ type: "drill.attempt" })
      .then((events) => { setCount(events.length); });
  }, []);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="t-title">{en.progress.title}</h1>
      <p className="t-body prose-measure">{en.progress.intro}</p>
      {count !== undefined ? <p className="t-meta text-quiet">{en.progress.events(count)}</p> : null}
    </div>
  );
}
