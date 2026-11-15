# Ops runbook: the two sites on Cloudflare

How the Quiet site (`<domain>`), the Live site (`listen.<domain>`) and the `emunas-api` Worker
are provisioned, configured, deployed and rolled back. Source of truth for the design:
`integration-plan.md` §3 and §4, as changed by **Amendment A1** (audio is served straight from
the `emunas` bucket on `media.<domain>`; there is no audio bucket, no audio Worker route, no
`AUDIO_ENABLED` switch and no `audio-publish` workflow).

Nothing here has been run against a real account yet. The configs are validated with
`wrangler deploy --dry-run` and the workflows with `actionlint`; the first real deploy is part
of W6.1.

## 1. What runs where

| Worker | Config | Serves | Code |
|---|---|---|---|
| `emunas-quiet` | `apps/quiet/wrangler.jsonc` | `apps/quiet/dist` (Astro static), `html_handling: auto-trailing-slash`, `not_found_handling: 404-page` | **none** (assets only) |
| `emunas-live` | `apps/live/wrangler.jsonc` | `apps/live/build/client`, `not_found_handling: single-page-application`; Worker first for `/`, `/api/*`, `/admin/*` | `apps/live/worker/index.ts` |
| `emunas-api` | `workers/api/wrangler.jsonc` (W2.6) | reached only through Live's `API` service binding (`workers_dev: false`, no route) | `workers/api/src` |

Each config has a top level (production) and `env.staging` (`emunas-quiet-staging`,
`emunas-live-staging` → `emunas-api-staging`). PR previews are versions of the **staging**
Workers, so a preview can never reach production D1.

Live Worker behaviour:

- `GET|HEAD /` → `302` to `/yi/` or `/en/` (query kept). Order: cookie `emunas_ui=yi|en`
  (written by the Live app when the reader picks a language), then `Accept-Language`
  (highest q; `yi`/`ji`/`he`/`iw` → `yi`, `en` → `en`), else `en`. `Cache-Control: private, no-store`,
  `Vary: Cookie, Accept-Language`. Other methods → `405`.
- `/api`, `/api/*`, `/admin`, `/admin/*` → forwarded unchanged to `env.API`.
- On `*.workers.dev` hosts the Worker adds `X-Robots-Tag: noindex` to the responses it makes
  (static responses get it from `_headers`).

## 2. Headers and the media origin

`apps/{quiet,live}/public/_headers` are templates copied into the build output by the app
builds. They contain the placeholder `{{EMUNAS_MEDIA_ORIGIN}}`, which
`apps/{quiet,live}/worker/render-headers.ts` replaces in the built copy:

```sh
EMUNAS_MEDIA_ORIGIN=https://media.<domain> npx tsx apps/quiet/worker/render-headers.ts apps/quiet/dist/_headers
EMUNAS_MEDIA_ORIGIN=https://media.<domain> npx tsx apps/live/worker/render-headers.ts apps/live/build/client/_headers
```

The tool validates the origin (https, no path; `http://localhost` allowed for local work),
refuses to run without it unless `--allow-missing` is given (then media is `'self'` only), and
checks the Workers `_headers` limits (100 rules, 2,000 characters per line). The two copies of
the tool are identical apart from their header comment (a test enforces it).

| | Quiet | Live |
|---|---|---|
| CSP | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; media-src 'self' <media>; connect-src 'self'; frame-ancestors 'none'; …` | as Quiet, plus `connect-src 'self' <media>` (service-worker offline downloads), Turnstile in `script-src`/`frame-src`, `worker-src 'self'`; `script-src`/`style-src` also allow `'unsafe-inline'` because React Router's prerendered HTML carries per-page inline bootstrap scripts |
| immutable | `/_astro/*` | `/assets/*` |
| other caching | `/fonts/*` one day + SWR (font names are not hashed), `/pagefind/*` 1 h | `/data/*` 5 min + SWR 1 day, `/sw.js` no-cache |
| noindex | `https://:worker.:subdomain.workers.dev/*` | same, plus the Worker (above) |

## 3. One-time provisioning

Run with a token that can manage Workers, D1, Vectorize, R2 and Workers AI (`npx wrangler@4.156.0 login`
or `CLOUDFLARE_API_TOKEN`). Order matters: the api Worker must exist before Live is deployed,
because Live binds to it.

```sh
W="npx --yes wrangler@4.156.0"

# D1: put each printed database_id into workers/api/wrangler.jsonc (top level and env.staging),
# replacing the placeholder 00000000-0000-4000-8000-… ids. deploy.yml refuses to run until then.
$W d1 create emunas-search
$W d1 create emunas-search-staging
$W d1 create emunas-feedback
$W d1 create emunas-feedback-staging

# Vectorize, 1,024 dims, cosine (model gated on the Yiddish eval, O10)
$W vectorize create emunas-moments --dimensions=1024 --metric=cosine
$W vectorize create emunas-moments-staging --dimensions=1024 --metric=cosine
# + metadata indexes as listed by W2.6/W3.10, e.g.
# $W vectorize create-metadata-index emunas-moments --property-name=lang --type=string

# CI-only bucket for the embedding cache (private)
$W r2 bucket create emunas-site-build

# api secrets (per environment)
$W secret put TURNSTILE_SECRET --config workers/api/wrangler.jsonc
$W secret put FEEDBACK_HASH_SALT --config workers/api/wrangler.jsonc
$W secret put TURNSTILE_SECRET --config workers/api/wrangler.jsonc --env staging
$W secret put FEEDBACK_HASH_SALT --config workers/api/wrangler.jsonc --env staging

# first deploys (after a local build, see §6): api, then quiet, then live, for both environments
```

**Provisioning check.** `workers/api/wrangler.jsonc` ships placeholder D1 ids
(`00000000-0000-4000-8000-…`) so the repo validates before the account exists. deploy.yml's step
"Check emunas-api resources are provisioned" (right after `npm ci`) reads that file for the target
environment and fails with one `::error::` per binding that still has a placeholder id, or when the
environment has no `d1_databases` at all. It runs before any build, so an unprovisioned
environment fails in seconds instead of half-way through the deploy. To check locally:

```sh
grep -n '00000000-0000-4000-8000-' workers/api/wrangler.jsonc   # no output = provisioned
```

Audio (Amendment A1, W3.11; owner action):

1. Attach the custom domain `media.<domain>` to the existing `emunas` bucket (dashboard → R2 →
   `emunas` → Settings → Custom Domains). Do not enable the `r2.dev` URL.
2. Set CORS on the bucket so both sites (and staging/preview hosts, if offline downloads should
   work there) can `fetch()` audio:

   ```json
   [{
     "AllowedOrigins": ["https://<domain>", "https://listen.<domain>"],
     "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["Range"],
     "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
     "MaxAgeSeconds": 86400
   }]
   ```

   `npx wrangler@4.156.0 r2 bucket cors set emunas --file cors.json`
3. Set `EMUNAS_MEDIA_ORIGIN=https://media.<domain>` as a GitHub variable (below).

Domains (owner decision O8): add to each `wrangler.jsonc` at the top level, then deploy:

```jsonc
"routes": [{ "pattern": "<domain>", "custom_domain": true }]          // apps/quiet
"routes": [{ "pattern": "listen.<domain>", "custom_domain": true }]   // apps/live
```

`www.<domain>` → apex is a zone Redirect Rule (dashboard), not Worker code.

Turnstile: one widget for `listen.<domain>` (site key goes to the Live app config, secret to
`TURNSTILE_SECRET`). Access: a self-hosted application on `listen.<domain>/admin/*` for the owner.

## 4. GitHub configuration

| Kind | Name | Where | Used by |
|---|---|---|---|
| secret | `CLOUDFLARE_API_TOKEN` | environments `production`, `staging`; repository (for PR previews) | deploy.yml, ci.yml preview job |
| secret | `CLOUDFLARE_ACCOUNT_ID` | same | same |
| variable | `EMUNAS_MEDIA_ORIGIN` | environments `production`, `staging`; repository (PR builds) | corpus build, `_headers` |
| env (in the workflow) | `EMUNAS_DEPLOY: "1"` | set by deploy.yml itself, not configured | corpus build (placeholder media origin is fatal) |
| variable | `DATA_BRANCH` | repository (default `claude/dual-website-concepts-sm99sh`) | data-sync.yml |

**Deploy builds and the media origin.** `corpus:build` falls back to the dev placeholder
`https://media.example.invalid` when `EMUNAS_MEDIA_ORIGIN` is unset; normally that is only a
`build-report.json` warning (PR builds in ci.yml use it on purpose). A deploy must never ship it, so
when `CI=true` **and** the build is a deploy (the `--deploy` flag, or `EMUNAS_DEPLOY=1`/`true`/`yes`)
a placeholder origin makes `corpus:build` exit 1. deploy.yml sets `EMUNAS_DEPLOY: "1"` for the whole
job (and Actions sets `CI=true`), so a missing variable fails at "Check configuration" and, if that
were bypassed, again at "Corpus build". Locally (no `CI`) the flag has no effect; to rehearse the
deploy check: `CI=true npm run corpus:build -- --deploy` (fails without `EMUNAS_MEDIA_ORIGIN`).

Token scopes: Workers Scripts edit, Workers Routes edit (custom domains), D1 edit, Vectorize edit,
Workers AI read, Account settings read, and R2 limited to `emunas-site-build`. No workflow holds
credentials for the `emunas` bucket; the build never reads R2.

Environments: put required reviewers (or a branch rule "main only") on `production`.
Settings → Actions → General: allow GitHub Actions to create pull requests (data-sync's
fallback). If `main` is protected, allow `github-actions[bot]` to push, or data-sync can only
open pull requests.

## 5. Workflows

**ci.yml** (PRs, pushes to main): `check` (pipeline typecheck; `site:typecheck`, which also
covers the site Workers and the Live search eval suite; lint; `site:test`, which also runs the
Worker/config/`_headers` tests and the eval suite) and `build` (corpus:build → guard pre →
corpus:build --suppress → Quiet and Live builds → render `_headers` → `wrangler deploy --dry-run`
for both Workers and both environments, bundling the Live Worker → guard self-test (a planted
`heardAs` file must fail) → guard post-pass over `.corpus`, both outputs and the Worker bundle
→ budgets). Same-repo PRs then get `preview`: `wrangler versions upload --env=staging
--preview-alias pr-<n>` for both sites; the URLs land in the job summary. Without Cloudflare
secrets the preview step logs a notice and passes.

**deploy.yml** (push to main touching `data/derived`, `data/catalog`, `apps`, `packages`,
`workers`, `site-policy`; daily 05:17 UTC; manual dispatch with `target: production|staging`):
configuration check (`EMUNAS_MEDIA_ORIGIN` and the Cloudflare secrets) → provisioning check (§3)
→ corpus:build (with `EMUNAS_DEPLOY=1`) → guard pre → corpus:build --suppress →
`npm run search:build` → `npm run data:build --workspace=@emunas/live` → Quiet and Live builds →
render `_headers` → Worker bundles (dry run) → guard post (covers the api bundle too) → budgets →
`npm run data:budgets --workspace=@emunas/live` → D1 migrations (`DB_SEARCH`, `DB_FEEDBACK`) →
`npm run search:sync --workspace=@emunas/api -- --env <target>` when that script exists (W3.10) →
deploy `emunas-api` → `emunas-quiet` → `emunas-live` → job summary (full/total, newly full ids, downgrades with reasons, unmapped
counts, suppressed ids; never text). `concurrency: deploy-<target>`, cancel in progress.

The data steps between the corpus build and the app builds:

| Script | Reads | Writes | Notes |
|---|---|---|---|
| `npm run search:build` (`@emunas/search-core`) | `.corpus/` (+ `candidateTopics` through the corpus's allow-listed reader) | `.corpus/search/docs.ndjson`, `.corpus/search/moments.ndjson` | the indexed-field allow-list; read by Quiet's Pagefind glue and by `search:sync`. Flags: `--corpus`, `--data-dir`, `--no-keywords` |
| `npm run data:build -w @emunas/live` (`data-build/cli.ts emit`) | `.corpus/` | `apps/live/public/data/` (gitignored), every file validated against the W2.4 contract | must run before the Live build, which copies `public/` into `build/client/`. `--generated-at` defaults to `SOURCE_DATE_EPOCH`, else now |
| `npm run data:budgets -w @emunas/live` (`data-build/cli.ts budgets`) | `apps/live/public/data`, `apps/live/build/client` | nothing (console) | ≤ 18,000 client files, ≤ 25 MiB per file, brotli size targets per data kind (tech-live §3.3). Over a target is a warning; `corpus.json` has a soft target with a 400 KiB hard limit; a hard overrun exits 1 |

All three run after the guard pre-pass and before the guard post-pass, so everything they write is
scanned. None of them reads transcript files.

Guard drill: dispatch deploy with `plant_leak_fixture: true` (target staging). The run must
stop at "Guard post-pass" and deploy nothing.

**data-sync.yml** (hourly at :41; dispatch defaults to dry run): if `DATA_BRANCH` has commits
`main` lacks and every path changed since the merge base is under `data/`, merge (fast-forward
when possible), push `main` and dispatch deploy.yml (a push made with the workflow token does not
trigger workflows by itself). Otherwise it refuses and opens a pull request listing the paths
outside `data/` (or leaves the existing one open).

## 6. Local checks

```sh
npm ci
npm run corpus:build
npm run guard --workspace=@emunas/corpus-guard -- pre --corpus .corpus --out .corpus/suppress.json
npm run corpus:build -- --suppress .corpus/suppress.json
npm run search:build
npm run data:build --workspace=@emunas/live
npm run build --workspace=@emunas/quiet && npm run build --workspace=@emunas/live
export EMUNAS_MEDIA_ORIGIN=https://media.example.org
npx tsx apps/quiet/worker/render-headers.ts apps/quiet/dist/_headers
npx tsx apps/live/worker/render-headers.ts apps/live/build/client/_headers
(cd apps/quiet && npx --yes wrangler@4.156.0 deploy --dry-run --env="")
(cd apps/live && npx --yes wrangler@4.156.0 deploy --dry-run --env="" --outdir ../../.wrangler/bundles/live)
npm run guard --workspace=@emunas/corpus-guard -- post --scan .corpus apps/quiet/dist apps/live/build/client .wrangler/bundles --corpus .corpus
npm run data:budgets --workspace=@emunas/live
npm run site:typecheck && npm run site:lint && npm run site:test   # includes Workers + eval suite
actionlint
```

The Live e2e suite (`npm run test:e2e -w @emunas/live`) always answers `/data/*` from the committed
contract fixtures (`apps/live/app/data/fixtures/data`), so a local `data:build` does not change
what it tests; `LIVE_E2E_DATA=build` serves the built data instead for a manual smoke run.

`wrangler dev` from `apps/live` serves the built client with the Worker; without a local
`emunas-api` the `/api/*` binding is unavailable.

## 7. Rollback

- Sites and api: `npx wrangler@4.156.0 deployments list` / `versions list` in the app folder
  (or with `--config workers/api/wrangler.jsonc`), then `npx wrangler@4.156.0 rollback [<version-id>]`
  (`--env staging` for staging). Roll back Live and api together if an api contract changed.
- Static assets keep only the current version; a rollback brings back that version's assets.
- Search D1 and Vectorize are rebuildable from `.corpus` (rerun deploy.yml for the old commit).
- Feedback D1 is never touched by deploys; if needed, `wrangler d1 time-travel restore emunas-feedback --timestamp=<iso>`.
- Data: revert the data commit on `main` (or the merge data-sync made); the next deploy rebuilds.
- Stop everything: disable deploy.yml and data-sync.yml in the Actions tab.

## 8. When a run fails

| Step | Meaning | Action |
|---|---|---|
| Check configuration | a secret/variable missing for the environment | set it (§4) |
| corpus:build | `ingest.json`/`manifest.json`/policy invalid (the only fatal data errors) | fix in the pipeline |
| Guard post-pass | a forbidden key/substring or a ≥20-token verbatim run reached an output; the report has ids and paths only | fix the projector/app, or add an accepted id to `site-policy/verbatim-allow.json` by PR |
| Check emunas-api resources are provisioned | placeholder D1 ids in `workers/api/wrangler.jsonc` for the target | create the databases and commit their ids (§3) |
| corpus:build: "placeholder media origin" | `EMUNAS_DEPLOY` build without `EMUNAS_MEDIA_ORIGIN` | set the variable on the environment (§4) |
| search:build / data:build | `.corpus/` missing or a file fails its contract schema (data:build prints the file and path) | fix the emitter or the corpus projection |
| Budgets | > 18,000 files or a file > 25 MiB | look at what grew |
| Live data budgets | a data file over its hard limit (warnings alone do not fail) | look at what grew; targets are in `apps/live/data-build/budgets.ts` |
| Deploy emunas-live | service binding target missing | deploy `emunas-api` for that environment first |

## 9. Contracts for later packages

- `workers/api/wrangler.jsonc` (W2.6): `name: "emunas-api"`, `workers_dev: false`,
  `env.staging.name: "emunas-api-staging"`, D1 bindings with `migrations_dir` (default `migrations`).
  Comments on their own lines only (deploy.yml reads it as JSON after dropping `//` lines).
- `@emunas/api` script `search:sync` (W3.10): incremental D1 + Vectorize sync from `.corpus`,
  `-- --env production|staging`, idempotent and hash-diffed. It runs after the guard, so
  everything it uploads (D1 NDJSON rows, vector metadata) must already exist under `.corpus/`
  (written by corpus:build or an emit step placed before the guard post-pass), never be
  generated inside the sync itself.
- The app builds could run `render-headers.ts` themselves later; until then the workflows do.
