import * as z from "zod";

/**
 * Zod, configured before any schema in storage is created. `jitless` skips Zod 4's compiled object parsers,
 * which it detects by probing `new Function`: under the site's strict CSP that probe is reported as a
 * policy violation on every page, even though Zod swallows the error. Parsing is interpreted instead; the
 * engine and storage suites run in about the same time (DECISIONS D-034).
 *
 * Import `z` from here, never from "zod" directly, so the setting is always applied first.
 */
z.config({ jitless: true });

export { z };
