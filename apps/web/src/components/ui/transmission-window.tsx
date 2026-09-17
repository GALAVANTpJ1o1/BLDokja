"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

export interface TransmissionWindowProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Buttons along the bottom edge. */
  readonly actions?: ReactNode;
  /** Explicit trigger: Safari pointer activation does not necessarily focus buttons. */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * The one dialog shell (DESIGN.md, "Transmission window"): an angular panel with a thin chalk glow,
 * corner brackets, and a blurred backdrop. Built on the native <dialog> element, so focus is kept
 * inside, Escape closes it, and the rest of the page is inert while it is open. It enters with a
 * short opacity-only fade (under 200ms); with reduced motion it simply appears.
 *
 * The text inside stays plain: a clear heading and ordinary sentences.
 */
export function TransmissionWindow({ open, title, onClose, children, actions, returnFocusRef }: TransmissionWindowProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) { element.close(); returnFocusRef?.current?.focus(); }
  }, [open, returnFocusRef]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="transmission-window"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself, outside the panel) closes it.
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="transmission-panel">
        <span aria-hidden className="bracket bracket-tl" />
        <span aria-hidden className="bracket bracket-tr" />
        <span aria-hidden className="bracket bracket-bl" />
        <span aria-hidden className="bracket bracket-br" />
        <h2 id={titleId} className="t-subheading">
          {title}
        </h2>
        <div className="flex flex-col gap-3 t-body">{children}</div>
        {actions !== undefined ? <div className="flex flex-wrap justify-end gap-2 pt-2">{actions}</div> : null}
      </div>
    </dialog>
  );
}
