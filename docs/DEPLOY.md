# Deploying the site

The site is a folder of static files. There is no server, no database and no API: everything a reader does
stays in their browser (BRIEF §2, §12). Any static host works.

**Live at https://bldokja.pages.dev** since 2026-09-19: a Cloudflare Pages project named `bldokja` (free
`*.pages.dev` subdomain, direct upload, no git integration). This file is the recipe for building and
redeploying it; the Cloudflare-specific commands are under "Deploying to Cloudflare Pages" below.

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
| `scripts/csp.mjs` | writes a Content Security Policy `<meta>` into every page, allowing each page's own inline scripts by hash and (when `NEXT_PUBLIC_SUPABASE_URL` is set at build time) that one Supabase origin in `connect-src` |
| `scripts/sw.mjs` | writes `sw.js`, which precaches every file so the site works offline |

Upload the contents of `apps/web/out/` to the host's root.

## Deploying to Cloudflare Pages

Needs `wrangler` logged in (`pnpm exec wrangler whoami`). Both Supabase values below are public by design
(the URL is an API host, the publishable key only acts through RLS), so they can sit on the command line;
the service-role key must never appear anywhere in this flow.

```
# bash / Git Bash
export NEXT_PUBLIC_SUPABASE_URL="https://dlqphprfgsqyfbpsfvqd.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="<the sb_publishable_... key>"
pnpm build
pnpm exec wrangler pages deploy apps/web/out --project-name bldokja --branch main
```

```
# PowerShell
$env:NEXT_PUBLIC_SUPABASE_URL="https://dlqphprfgsqyfbpsfvqd.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY="<the sb_publishable_... key>"
pnpm build
pnpm exec wrangler pages deploy apps/web/out --project-name bldokja --branch main
```

- **Set both variables in the same shell that runs `pnpm build`.** `next build` would also read
  `apps/web/.env.local`, but `scripts/csp.mjs` runs afterwards as a plain Node script and does not; without
  the variable in the environment it writes `connect-src 'self'` and the deployed site silently has no
  accounts, leaderboards or deletion (D-069).
- `--branch main` is what makes it the **Production** deployment; any other branch name publishes a preview
  at its own hostname. `wrangler pages deployment list --project-name bldokja` shows which is which.
- A deploy replaces the whole site atomically and keeps earlier deployments, so a bad one can be rolled back
  from the Cloudflare dashboard (Workers & Pages → bldokja → Deployments).

Checks worth repeating after each deploy (all passed on the first one, D-072): the CSP `<meta>` on `/account/`
names the Supabase origin; the response headers match the table below; `/sw.js` is `no-cache`; the
leaderboard page loads its data (an `rpc/leaderboard_streaks` call answered 200 under the CSP); and
`BLD_TEST_URL=https://bldokja.pages.dev pnpm exec playwright test launch` passes.

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
| `/opengraph-image` | `Content-Type: image/png` | the share card is exported with no file extension, so the host can't infer its type (D-073) |

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

## v2: accounts and sync (Supabase)

v2 (docs/DECISIONS.md D-053 onward) adds an optional account layer behind Supabase. Guests still need
none of this — the site above still works exactly as v1 without it. This section is the recipe for the
account/sync layer only. It is deployed: all ten migrations are applied to the live project and both Edge
Functions are deployed (D-072).

**Environment variables.** There is no committed `.env.example` (a permission rule in this environment
blocks writing any `.env*` file, even a placeholder one) — the variables an actual deploy needs are:

| Variable | Where it's read | Safe to expose publicly? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web` build (baked into the static export) | Yes — it's just the project's API host |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web` build | Yes — this key only ever acts through RLS; it is designed to be public |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `apps/web` build | Yes — Turnstile site keys are meant to be embedded client-side |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase/functions/redeem-recovery-code` only, via `supabase secrets set` | **No.** Never put this in `apps/web`'s env or any `NEXT_PUBLIC_*` variable — it bypasses every RLS policy |
| `SITE_ORIGINS` | same Edge Function, a comma-separated CORS allow-list | Not secret, just config |

Because `apps/web` is a static export, `NEXT_PUBLIC_*` values are visible to anyone who views the page
source — that is expected and safe for the three above, and exactly why the service-role key must never
become one of them.

**Supabase migrations** live in `supabase/migrations/` (profiles, the sync tables, the private
letter-pair-images Storage bucket, and the three leaderboard functions — see D-056/D-057 for the design).
Apply them with `supabase db push` against the real project once it exists; `supabase/config.toml` is the
local-dev configuration (`supabase start`, needs Docker, not available in every environment).

**Supabase Auth Site URL and redirect URLs** are set to the deployed origin
(`https://bldokja.pages.dev`) in the Supabase dashboard (Authentication → URL Configuration; done by the owner, 2026-09-19) —
`supabase/config.toml`'s `site_url`/`additional_redirect_urls` are the local-dev placeholders
(`127.0.0.1:3000`) and are not production values. Low urgency: accounts use a synthetic, never-delivered
email address (D-054), so no email link is ever sent that would carry this URL.

**Edge Function origins.** Both functions allow the exact origins in `SITE_ORIGINS` (default
`http://localhost:3000,https://bldokja.pages.dev`), any localhost/127.0.0.1 port, and any host under
`.bldokja.pages.dev` (preview deployments). Verified from the live origin with a CORS preflight (D-072).
Redeploy after changing them: `supabase functions deploy delete-own-account` and
`supabase functions deploy redeem-recovery-code --no-verify-jwt`.

**Deploying `apps/web`'s static export changes nothing about the "no cookies" claim above** — the
Supabase JS client keeps its session in `localStorage`, not a cookie, so that guarantee still holds for
v2 as built here.
