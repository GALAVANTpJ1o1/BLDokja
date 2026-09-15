/**
 * Feature flags (BRIEF §12): half-built things ship dark. A flag is on in development, and in a
 * production build only when listed in NEXT_PUBLIC_FLAGS (comma-separated), read at build time.
 */
const listed = new Set((process.env.NEXT_PUBLIC_FLAGS ?? "").split(",").map((f) => f.trim()));
const dev = process.env.NODE_ENV !== "production";

export const FLAGS = {
  /** The design-system review page. */
  lab: dev || listed.has("lab"),
} as const;

export type Flag = keyof typeof FLAGS;
