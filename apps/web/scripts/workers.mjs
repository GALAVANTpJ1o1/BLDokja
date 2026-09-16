import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const web = join(import.meta.dirname, "..");
const cubing = dirname(dirname(fileURLToPath(import.meta.resolve("cubing/search"))));
const vendor = join(web, "public", "vendor", "cubing");
mkdirSync(join(web, "public", "fonts"), { recursive:true });
cpSync(join(web, "node_modules", "@fontsource-variable", "recursive", "files", "recursive-latin-casl-normal.woff2"), join(web, "public", "fonts", "recursive-5.3.0-latin-casl.woff2"));
const entries = new Set();
function collect(path) {
  if (entries.has(path)) return;
  entries.add(path);
  for (const match of readFileSync(path, "utf8").matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+)["']/g)) {
    collect(resolve(dirname(path), match[1]));
  }
}
collect(join(cubing, "search", "index.js"));
collect(join(cubing, "scramble", "index.js"));
collect(join(cubing, "chunks", "search-worker-entry.js"));
// Clear only this exact generated subtree; never user-authored public assets.
if (resolve(vendor) !== resolve(web, "public", "vendor", "cubing")) throw new Error("invalid-vendor-target");
rmSync(vendor, { recursive: true, force: true });
await build({
  entryPoints: [...entries], outdir: vendor, outbase: cubing,
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true,
  plugins: [{ name: "preserve-cubing-worker-graph", setup(builder) {
    builder.onResolve({ filter: /^\./ }, (args) => {
      if (args.importer.startsWith(cubing + sep)) return { path: args.path, external: true };
    });
  } }],
});
await build({
  entryPoints: [join(web, "src", "lib", "methods.worker.ts")],
  outfile: join(web, "public", "workers", "methods.js"),
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true,
  tsconfig: join(web, "tsconfig.json"),
});
console.log("workers: compiled method search and self-hosted cubing.js modules");
