"use client";

import dynamic from "next/dynamic";
import { en } from "@/i18n/en";

/** The editor reads your saved scheme as it starts, so it only renders in the browser. */
export const LetteringLoader = dynamic(
  () =>
    import("./scheme-editor").then((m) => {
      const Editor = () => (
        <>
          <m.SchemeEditor />
          <m.BufferPicker />
        </>
      );
      return Editor;
    }),
  { ssr: false, loading: () => <p className="t-meta text-quiet">{en.cube.loading}</p> },
);
