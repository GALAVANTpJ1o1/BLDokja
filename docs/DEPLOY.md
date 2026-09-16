# Deploying the site

The site is a folder of static files. There is no server, no database and no API: everything a reader does
stays in their browser (BRIEF §2, §12). Any static host works.

**Nothing has been deployed.** This file is the recipe; running it is yours to do.

## Build it

```
pnpm install
pnpm test && pnpm typecheck && pnpm lint
pnpm build
```

`pnpm build` writes `apps/web/out/`, then three steps run over it:

| Step | What it does |
|---|---|
| `scripts/segments.mjs` | copies Next's route payloads to the flat names its client asks for, so client-side navigation works on a static host |
| `scripts/csp.mjs` | writes a Content Security Policy `<meta>` into every page, allowing each page's own inline scripts by hash |
| `scripts/sw.mjs` | writes `sw.js`, which precaches every file so the site works offline |

Upload the contents of `apps/web/out/` to the host's root.

## Headers

A `<meta>` policy can't carry `frame-ancestors`, and the service worker needs to be revalidated on every
deploy, so set these as response headers. `apps/web/out/_headers` is written by the build in the format
Netlify and Cloudflare Pages read; other hosts need the same values in their own syntax.

| Path | Header | Why |
|---|---|---|
| `/*` | `Content-Security-Policy: frame-ancestors 'none'` | the pages' own policy covers everything else |
| `/*` | `X-Content-Type-Options: nosniff` | |
| `/*` | `Referrer-Policy: no-referrer` | nothing here needs a referrer |
| `/*` | `Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()` | the site asks for none of these |
| `/sw.js` | `Cache-Control: no-cache` | so a new deploy is noticed |
| `/_next/static/*` | `Cache-Control: public, max-age=31536000, immutable` | those file names carry a content hash |
| `/manifest.webmanifest` | `Cache-Control: public, max-age=3600` | |

Serve `404.html` for unknown paths. Keep the trailing slashes: pages are exported as `learn/index.html`
and the app links to `/learn/`.

## What a deploy must not add

- **No analytics, tag managers or third-party scripts.** The CSP would block them, and BRIEF §12 rules
  them out.
- **No cookies.** The site sets none.
- **No redirect away from HTTPS.** A service worker and persistent storage both need a secure origin.

## After a deploy

1. Open the site, then load it again with the network off: it should work offline (the worker precaches
   every page).
2. A new deploy installs its worker in the background; a reader gets it once every tab of the old version
   has closed. That's deliberate, so a page never mixes files from two builds.
3. Check `Content-Security-Policy` in the response headers and the `<meta>` in the page source.

## Custom domain

Nothing in the code refers to a host name: pages are linked by absolute path, and the manifest's
`start_url` is `/`. Any domain or subpath-free hosting works as it stands.
