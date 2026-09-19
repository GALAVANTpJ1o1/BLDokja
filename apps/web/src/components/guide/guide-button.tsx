"use client";

import { QuestionIcon } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { guideUi } from "@/i18n/guides";
import { OPEN_GUIDE_EVENT } from "./page-guide";
import { guideForPath } from "./guides";

/**
 * The header button that opens the guide for the page you are on, again, whenever you want it. It is only
 * there on pages that have a guide, so it never offers something that would open nothing.
 */
export function GuideButton() {
  const pathname = usePathname();
  if (guideForPath(pathname) === undefined) return null;
  return (
    <button type="button" className="btn guide-button" aria-haspopup="dialog" onClick={(event) => { window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT, { detail: { opener: event.currentTarget } })); }}>
      <QuestionIcon size={18} aria-hidden />
      {guideUi.button}
    </button>
  );
}
