/**
 * Strict Content Security Policy for the static export (BRIEF §12; your 2026-09-15 answer: static
 * first, inline scripts allowed by hash). Runs after `next build`. For every HTML file in out/, it
 * hashes each inline <script> exactly as written and puts a CSP <meta> first in <head> that allows
 * those hashes and nothing inline besides.
 *
 * What a <meta> policy can't carry (frame-ancestors, report-to) needs response headers, which is a
 * deploy concern for Phase 8.
 *
 * - style-src allows 'unsafe-inline': React style attributes and cubing.js's shadow-DOM styles need it.
 * - script-src allows 'wasm-unsafe-eval': cubing.js's solver runs as WebAssembly.
 * - worker-src allows blob:: cubing.js may start its solver worker from a blob URL.
 */
import { createHash } from "node:crypto";
import { URL } from "node:url";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(import.meta.dirname, "..", "out");

// v2 accounts talk to Supabase from the browser (auth, REST, Storage, Edge Functions), all under one
// project origin. Without it in connect-src the browser blocks every one of those calls in a
// production build -- invisible in `next dev`, which has no CSP meta tag. The origin comes from the
// same NEXT_PUBLIC_SUPABASE_URL that gets inlined into the bundle, so the policy and the client can't
// disagree; with it unset (a guest-only build) connect-src stays 'self'.
const connectSources = ["'self'"];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl !== undefined && supabaseUrl.length > 0) {
  let origin;
  try {
    origin = new URL(supabaseUrl);
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${supabaseUrl}`);
  }
  if (origin.protocol !== "https:") throw new Error(`NEXT_PUBLIC_SUPABASE_URL must be https for the CSP: ${supabaseUrl}`);
  connectSources.push(origin.origin);
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith(".html") ? [path] : [];
  });
}

const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g;

let files = 0;
let scripts = 0;
for (const file of htmlFiles(outDir)) {
  const html = readFileSync(file, "utf8");
  if (html.includes('http-equiv="Content-Security-Policy"')) throw new Error(`${file} already has a CSP meta tag`);
  // next/script's beforeInteractive code is injected inline at run time, so no hash here would cover it.
  if (html.includes("self.__next_s")) throw new Error(`${file} has a beforeInteractive script; load it as a same-origin file instead`);
  const hashes = new Set();
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    // The HTML parser turns CRLF and lone CR into LF before a script's text is hashed, so hash it that way too.
    const body = (match[2] ?? "").replace(/\r\n?/g, "\n");
    if (body.length === 0) continue;
    hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
    scripts++;
  }
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${[...hashes].join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  const head = html.match(/<head[^>]*>/);
  if (head === null || head.index === undefined) throw new Error(`${file} has no <head>`);
  const at = head.index + head[0].length;
  writeFileSync(file, `${html.slice(0, at)}<meta http-equiv="Content-Security-Policy" content="${policy}">${html.slice(at)}`);
  files++;
}
console.log(`csp: ${files} pages, ${scripts} inline scripts hashed`);
