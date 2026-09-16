/** Native controls keep their own keyboard behavior; drill shortcuts apply on the drill surface. */
export function shortcutIgnored(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return true;
  if (document.querySelector("dialog[open]") !== null) return true;
  return event.target instanceof Element && event.target.closest("input,textarea,select,button,a,[contenteditable=true],table,[data-shortcuts=off]") !== null;
}
