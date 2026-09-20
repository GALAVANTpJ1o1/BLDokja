"use client";

import { useEffect, type RefObject } from "react";

/** How far the mouse has to move before a press becomes a drag, so an ordinary click on a cell still opens it. */
const DRAG_AFTER_PX = 5;

/**
 * Click-and-drag scrolling for a wide grid, with an open-hand cursor (CSS: `.drag-scroll`). Holding the mouse button
 * and moving scrolls the grid sideways and the page up or down, so nobody has to travel to the bottom of the grid for
 * its scrollbar. Only the mouse: a finger already scrolls natively, and keyboard use is untouched. A press that turns
 * into a drag does not also click the cell under the pointer.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const found = ref.current;
    if (found === null) return;
    const element: HTMLElement = found;
    let press: { x: number; y: number; lastX: number; lastY: number } | undefined;
    let dragging = false;

    const stop = () => {
      press = undefined;
      dragging = false;
      delete element.dataset.dragging;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    function onMove(event: PointerEvent) {
      if (press === undefined) return;
      if (!dragging) {
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_AFTER_PX) return;
        dragging = true;
        element.dataset.dragging = "true";
      }
      element.scrollLeft -= event.clientX - press.lastX;
      window.scrollBy(0, -(event.clientY - press.lastY));
      press.lastX = event.clientX;
      press.lastY = event.clientY;
    }
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      // A drag that ended outside the grid never produced a click here, so it must not swallow the next real one.
      wasDragged = false;
      press = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    };
    // Runs before the cell's own click handler (capture phase) and swallows the click that ends a drag.
    const onClick = (event: MouseEvent) => {
      if (!wasDragged) return;
      wasDragged = false;
      event.stopPropagation();
      event.preventDefault();
    };
    let wasDragged = false;
    const remember = () => { wasDragged = dragging; };
    element.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", remember, true);
    element.addEventListener("click", onClick, true);
    return () => {
      stop();
      element.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", remember, true);
      element.removeEventListener("click", onClick, true);
    };
  }, [ref]);
}
