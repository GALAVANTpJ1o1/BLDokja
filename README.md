# BLDokja

BLDokja is a local-first, offline-capable learning platform for blindfolded cubing. It includes guided 3BLD and 4BLD lessons, interactive cube visualisations, recognition and tracing drills, algorithm/reference workspaces, spaced-repetition letter-pair practice, and local progress tracking.

Version 1 is complete. The application has no accounts, backend, analytics, or remote database: your practice data stays in your browser and can be exported from Settings.

## Run locally

Prerequisites:

- Node.js 22.3 or newer
- Corepack (bundled with supported Node releases)

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The development command builds the workspace packages that the web app consumes before starting Next.js.

## Verify a checkout

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm build` exports a static, deployable site to `apps/web/out/`. To inspect that production export locally:

```sh
pnpm --filter @bld/web start
```

The export includes its offline service worker. See [docs/DEPLOY.md](docs/DEPLOY.md) for host headers and deployment details.

## Project structure

- `apps/web` — Next.js application and static export
- `packages/cube-engine` — pure, tested cube state, tracing, algorithms, and validation
- `packages/storage` — versioned local persistence behind the `StorageAdapter` interface
- `packages/srs` and `packages/analytics` — local scheduling and progress aggregation
- `content` — MDX lesson content and verified datasets

## Privacy

No user data is sent to a server. The project is designed to run offline after the initial asset cache is prepared, and it does not include third-party analytics or authentication.
