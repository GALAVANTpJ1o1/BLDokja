/**
 * Which step a running guide should be on when the page changes under it.
 *
 * Pages load in stages and some sections come and go (a trainer's header is there before its drill; a
 * signed-in section is not there for a guest), so the steps a guide can show are re-read while it runs.
 * `order` is every step of the guide in its own order, `available` the ones whose element is on screen now.
 * If the current step is still available it stays. If not, the guide moves to the next available step, or if
 * there is none after it, the nearest one before. Undefined means nothing is left to show.
 */
export function settle(order: readonly string[], available: readonly string[], current: string): string | undefined {
  if (available.includes(current)) return current;
  const at = order.indexOf(current);
  const after = order.slice(at + 1).find((id) => available.includes(id));
  if (after !== undefined) return after;
  return order
    .slice(0, Math.max(at, 0))
    .reverse()
    .find((id) => available.includes(id));
}

/** The step before or after `current` among those available, or undefined at either end. */
export function neighbour(available: readonly string[], current: string, direction: 1 | -1): string | undefined {
  const at = available.indexOf(current);
  return at === -1 ? undefined : available[at + direction];
}
