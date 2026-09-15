/**
 * Next 16's static export writes route-segment payloads as `learn/__next.learn/__PAGE__.txt`, but its
 * client prefetches `learn/__next.learn.__PAGE__.txt`, so static hosts answer 404 and navigation falls
 * back to a full page load. This copies each nested payload to the flat name the client asks for.
 */
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const outDir = join(import.meta.dirname, "..", "out");
let copied = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const file of readdirSync(path)) {
        if (!statSync(join(path, file)).isFile()) continue;
        copyFileSync(join(path, file), join(dir, `${name}.${file}`));
        copied++;
      }
    }
    walk(path);
  }
}

walk(outDir);
console.log(`segments: ${copied} payloads copied to flat names`);
