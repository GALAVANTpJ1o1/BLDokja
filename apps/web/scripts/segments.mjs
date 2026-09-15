/**
 * Next 16's static export writes route-segment payloads as nested files, such as
 * `practice/trace/__next.practice/trace/__PAGE__.txt`, but its client prefetches the flat name
 * `practice/trace/__next.practice.trace.__PAGE__.txt`, so static hosts answer 404 and navigation falls
 * back to a full page load. This copies each nested payload, at any depth, to the flat name.
 */
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const outDir = join(import.meta.dirname, "..", "out");
let copied = 0;

/** Copy every file under a `__next.*` directory to `<owner>/<dir name>.<path joined with dots>`. */
function flatten(owner, dir, prefix) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) flatten(owner, path, `${prefix}.${name}`);
    else {
      copyFileSync(path, join(owner, `${prefix}.${name}`));
      copied++;
    }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;
    if (name.startsWith("__next.")) flatten(dir, path, name);
    else walk(path);
  }
}

walk(outDir);
console.log(`segments: ${copied} payloads copied to flat names`);
