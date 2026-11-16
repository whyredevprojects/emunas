# Ops runbook: the sites on Cloudflare

How the landing site ("home", on the apex `<domain>`), the Quiet site (the library,
`library.<domain>`), the Live site (`listen.<domain>`) and the `emunas-api` Worker are provisioned, configured, deployed and rolled back. Source of truth for the design:
`integration-plan.md` §3 and §4, as changed by **Amendment A1** (audio is served straight from
R2 on `media.<domain>`; there is no audio Worker route, no `AUDIO_ENABLED` switch and no
`audio-publish` workflow). The custom domain is on the `emunas` bucket itself. That bucket also
holds `transcripts/` and `site/files/`; they are reachable by key on the media host, which is
accepted (owner decision): nothing the sites publish ever links to them.

`<domain>` is `EMUNAS_DOMAIN`: today `emunas.torahlearningtools.com`, later `emunas.com`. Every
host is derived from it (`@emunas/links` `productionHosts`), so the move is a config change only
(§3 "Domains and cutover").

Nothing here has been run against a real account yet. The configs are validated with
`wrangler deploy --dry-run` and the workflows with `actionlint`; the first real deploy is part
of W6.1 and follows the checklist in §11. Every GitHub variable and secret is listed in §4.

## 1. What runs where

| Worker | Config | Serves | Code |
|---|---|---|---|
| `emunas-home` | `apps/home/wrangler.jsonc` | the landing site on `<domain>`; `/files/*` (essay and article PDFs, images) from the `emunas` bucket, key prefix `site/files/` (`/files/essays/<slug>.pdf`, `/files/articles/<slug>.pdf`, `/files/images/<name>`) | see `apps/home` |
| `emunas-quiet` | `apps/quiet/wrangler.jsonc` | `apps/quiet/dist` (Astro static), `html_handling: auto-trailing-slash`, `not_found_handling: 404-page` | **none** (assets only) |
| `emunas-live` | `apps/live/wrangler.jsonc` | `apps/live/build/client`, `not_found_handling: single-page-application`; Worker first for `/`, `/api/*`, `/admin/*` | `apps/live/worker/index.ts` |
| `emunas-api` | `workers/api/wrangler.jsonc` (W2.6) | reached only through Live's `API` service binding (`workers_dev: false`, no route) | `workers/api/src` |

Each config has a top level (production) and `env.staging` (`emunas-home-staging`,
`emunas-quiet-staging`, `emunas-live-staging` → `emunas-api-staging`). PR previews are versions of the **staging**
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
| CSP | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-…' (theme init script); style-src 'self'; media-src 'self' <media>; connect-src 'self'; frame-ancestors 'none'; …` | as Quiet, plus `connect-src 'self' <media>` (service-worker offline downloads), Turnstile in `script-src`/`frame-src`, `worker-src 'self'`; `script-src`/`style-src` also allow `'unsafe-inline'` because React Router's prerendered HTML carries per-page inline bootstrap scripts |
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
2. Set CORS on the bucket. Plain `<audio src>` playback needs no CORS (the media element does not
   send `Origin` without a `crossorigin` attribute, and neither site sets one); CORS is for Live's
   `fetch()` of audio (offline downloads in the service worker, which also sends `Range` to
   resume). The rule: **GET and HEAD only, the `Range` request header, the Quiet and Live origins**, plus
   the staging Live/Quiet workers.dev origins if offline downloads should work on staging. Before
   a domain is set the production origins are the workers.dev ones. Example `cors.json`
   (replace `<domain>` and `<sub>`; origins are exact, scheme + host, no trailing slash):

   ```json
   {
     "rules": [
       {
         "allowed": {
           "origins": [
             "https://library.<domain>",
             "https://listen.<domain>",
             "https://emunas-quiet-staging.<sub>.workers.dev",
             "https://emunas-live-staging.<sub>.workers.dev"
           ],
           "methods": ["GET", "HEAD"],
           "headers": ["Range"]
         },
         "exposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
         "maxAgeSeconds": 86400
       }
     ]
   }
   ```

   ```sh
   npx --yes wrangler@4.156.0 r2 bucket cors set emunas --file cors.json
   npx --yes wrangler@4.156.0 r2 bucket cors list emunas      # check
   ```

   The dashboard (R2 → `emunas` → Settings → CORS policy) takes the same rule in the S3 shape:
   `[{"AllowedOrigins": [...], "AllowedMethods": ["GET","HEAD"], "AllowedHeaders": ["Range"],
   "ExposeHeaders": ["Content-Length","Content-Range","Accept-Ranges","ETag"], "MaxAgeSeconds": 86400}]`.
   Check from a shell (expect `206`, `access-control-allow-origin: https://listen.<domain>` and
   `content-range`):

   ```sh
   curl -sI -H 'Origin: https://listen.<domain>' -H 'Range: bytes=0-1' 'https://media.<domain>/<some key>.mp3'
   ```

   PR preview hosts (`pr-<n>-emunas-live-staging.<sub>.workers.dev`) are not listed: audio plays
   there, offline downloads do not. R2 allows one `*` per origin, so
   `https://*-emunas-live-staging.<sub>.workers.dev` would cover them if wanted. CORS headers on
   mp3s already in the CDN cache appear only after a purge of `media.<domain>` (dashboard →
   Caching → Purge, hostname `media.<domain>`); propagation can take up to 30 s.
3. Set `EMUNAS_MEDIA_ORIGIN=https://media.<domain>` as a GitHub variable (below).

### Domains and cutover

| Host | Worker / service | `wrangler.jsonc` route (top level only; `env.staging` has `"routes": []`) |
|---|---|---|
| `<domain>` | `emunas-home` | `[{ "pattern": "<domain>", "custom_domain": true }]` |
| `library.<domain>` | `emunas-quiet` | `[{ "pattern": "library.<domain>", "custom_domain": true }]` |
| `listen.<domain>` | `emunas-live` | `[{ "pattern": "listen.<domain>", "custom_domain": true }]` |
| `media.<domain>` | R2 bucket `emunas` (custom domain, not a Worker) | none |

The routes must match `productionHosts(<domain>)` of `@emunas/links`;
`apps/quiet/worker/test/site-routes.test.ts` reads the three `wrangler.jsonc` files and fails when
they disagree (it takes `<domain>` from Quiet's `library.` route). Each Worker has exactly one
host. There is no `www.<domain>` host and no redirect to the apex.

Custom Domains create their DNS records and certificates themselves when the zone is on the
account; remove any existing A/AAAA/CNAME record for the same name first (the old site's records in
particular), or the Custom Domain cannot be attached.

Cutover to a new domain `<new>` (e.g. `emunas.com`), all config, no code:

1. Zone `<new>` on the Cloudflare account (nameservers moved). Lower the TTLs of the old records
   beforehand if the old site is still live.
2. Change the `routes` in `apps/home/wrangler.jsonc`, `apps/quiet/wrangler.jsonc` and
   `apps/live/wrangler.jsonc` to `<new>`, `library.<new>`, `listen.<new>` (PR; the
   routes test must pass).
3. Set the GitHub variable `EMUNAS_DOMAIN=<new>` on `production` and
   `EMUNAS_MEDIA_ORIGIN=https://media.<new>` (§4).
4. R2 → `emunas` → Custom Domains: add `media.<new>`. Add `https://library.<new>` and
   `https://listen.<new>` to the bucket CORS rule (§3 Audio).
5. Turnstile widget: add `listen.<new>`. Access application: add `listen.<new>/admin/*`.
6. Deploy production (§5). The deploy attaches the Custom Domains; check each host (§11
   production smoke).
7. Keep the old hosts attached until the new ones are verified, then remove their routes. Once the
   old routes are gone, remove `media.<old>` from `emunas` and the old origins from CORS.

Old `emunas.com` addresses (the Weebly site's page and file paths) are not preserved and are not
redirected.

Turnstile: one widget for `listen.<domain>` (dashboard → Turnstile → Add widget, hostname
`listen.<domain>`, mode Managed). Its **site key** is public and goes to the GitHub variable
`VITE_TURNSTILE_SITE_KEY` on the `production` environment (Vite bakes it into the Live build); its
**secret** goes to `TURNSTILE_SECRET` on `emunas-api`. For staging either add the staging Live
host (`emunas-live-staging.<sub>.workers.dev`) to the same widget and use the same pair, or use
Cloudflare's always-pass test pair (site key `1x00000000000000000000AA`, secret
`1x0000000000000000000000000000000AA`) on the `staging` environment and `emunas-api-staging`.
Without a site key a deployed Live build hides the "report a problem" control (deploy.yml warns).
Access: a self-hosted application on `listen.<domain>/admin/*` for the owner; put its team domain
and AUD tag into `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` in `workers/api/wrangler.jsonc` (both envs).

## 4. GitHub configuration

Every variable and secret the workflows read. GitHub resolves an environment's value first, then
the repository's, so a value set at repository level applies to `production` **and** `staging`
unless the environment overrides it. Required = deploy.yml's "Check configuration" step fails
without it.

| Kind | Name | Set on | Required | Used by | Value |
|---|---|---|---|---|---|
| secret | `CLOUDFLARE_API_TOKEN` | environments `production`, `staging`; repository (PR previews) | yes | deploy.yml (wrangler, D1/Vectorize sync, R2 embedding mirror); ci.yml `preview` | API token, scopes below |
| secret | `CLOUDFLARE_ACCOUNT_ID` | same | yes | same; also the R2 S3 endpoint `https://<id>.r2.cloudflarestorage.com` | account id |
| secret | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | environments (optional) | no | deploy.yml embedding mirror (and the W3.10 sync) | an R2 API token pair, read on `emunas-site-build`. Unset: derived from `CLOUDFLARE_API_TOKEN` (key id = token id, secret = sha256(token)) |
| variable | `EMUNAS_MEDIA_ORIGIN` | repository (also serves PR builds) or each environment | yes | corpus build (audio URLs), `_headers` CSP `media-src`/`connect-src` | `https://media.<domain>` (no path, no trailing slash) |
| variable | `EMUNAS_DOMAIN` | environment `production` **only** (see "Staging vs production hosts") | one of these two | home build (links to the library and the listening app); Quiet build (canonical, hreflang, sitemaps, robots.txt, OG, cross-site links); Live build (canonical to Quiet, hreflang) | the apex, e.g. `emunas.torahlearningtools.com` (home = apex, Quiet = `library.` + it, Live = `listen.` + it). Must match the `wrangler.jsonc` routes (§3) |
| variable | `EMUNAS_WORKERS_SUBDOMAIN` | repository | one of these two | same, for the workers.dev hosts | the `<sub>` in `emunas-quiet.<sub>.workers.dev` (dashboard → Workers → Subdomain) |
| variable | `EMUNAS_HOME_ORIGIN`, `EMUNAS_QUIET_ORIGIN`, `EMUNAS_LIVE_ORIGIN` | not set in GitHub | no | local builds only: explicit origins override the derived ones | e.g. `http://localhost:4321`. Without a domain or subdomain, code that needs all three hosts (`hostsFromEnv`) needs all three set; Live SEO (`siteHostsFromEnv`) needs only Quiet and Live |
| variable | `EMUNAS_FEEDBACK_EMAIL` | repository or each environment | yes | Quiet "report an error" `mailto:` (C18) | one plain address |
| variable | `VITE_TURNSTILE_SITE_KEY` | environment `production`; `staging` (own widget or test key) | no (warning) | Live build: feedback dialog's Turnstile widget (W4.7) | the widget's public site key. Unset: the report control is hidden on deployed hosts |
| variable | `EMUNAS_NEIGHBORS` | repository (optional) | no | deploy.yml "same idea elsewhere" | `auto` (default: real embeddings when the R2 cache can be mirrored, else lexical) or `lexical` (skip the mirror) |
| variable | `EMUNAS_EMBED_BUCKET` | repository (optional) | no | deploy.yml embedding mirror | default `emunas-site-build` |
| variable | `DATA_BRANCH` | repository (optional) | no | data-sync.yml | default `claude/dual-website-concepts-sm99sh` |
| env (in the workflow) | `EMUNAS_DEPLOY: "1"`, `EMUNAS_STAGE`, `WRANGLER_ENV`, `TARGET` | set by deploy.yml itself, not configured | — | deploy builds (placeholders are fatal); staging host selection; wrangler env | derived from the dispatch `target` |

Worker secrets (not GitHub): `TURNSTILE_SECRET` and `FEEDBACK_HASH_SALT` on `emunas-api` and
`emunas-api-staging` (`wrangler secret put`, §3). Worker vars in `workers/api/wrangler.jsonc`:
`EMBED_MODEL` (also selects the R2 prefix the deploy mirrors), `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`.
PR builds in ci.yml read only `EMUNAS_MEDIA_ORIGIN` (with a placeholder fallback); they set no
hosts, so their pages are `noindex` with placeholder canonicals and are never deployed as such.

### Staging vs production hosts (canonical, hreflang, cross-site links)

The builds compute every absolute URL with `@emunas/links` `hostsFromEnv` (Live SEO:
`siteHostsFromEnv`, the same without home), from `EMUNAS_DOMAIN`,
`EMUNAS_WORKERS_SUBDOMAIN` and `EMUNAS_STAGE` (deploy.yml sets `EMUNAS_STAGE=staging` for
`target: staging`, empty for production):

| Target | `EMUNAS_DOMAIN` | `EMUNAS_WORKERS_SUBDOMAIN` | home / Quiet / Live origins in the build |
|---|---|---|---|
| production, no domain | unset | set | `https://emunas-{home,quiet,live}.<sub>.workers.dev` |
| production | set | any | `https://<domain>` / `https://library.<domain>` / `https://listen.<domain>` |
| staging | unset **for staging** | set | `https://emunas-{home,quiet,live}-staging.<sub>.workers.dev` |
| staging (misconfigured) | set, no subdomain | unset | production origins: staging pages would link and canonicalize to production |

So: set `EMUNAS_WORKERS_SUBDOMAIN` at repository level and `EMUNAS_DOMAIN` on the `production`
environment only. With both visible to staging the subdomain wins for staging (staging hosts), but
keeping the domain off staging makes that explicit.

What this means for search engines:

- Quiet is the canonical copy. Its pages are self-canonical with `hreflang` yi/en/x-default and a
  sitemap per edition; Live pages carry `<link rel="canonical">` to the Quiet equivalent and no
  sitemap (integration-plan §2.3).
- Every `*.workers.dev` host (production without a domain, all of staging, PR previews) answers
  with `X-Robots-Tag: noindex` (`_headers` and the Live Worker), so staging canonicals pointing at
  staging hosts never compete with production, and production without a domain is not indexed either.
- Builds without hosts (local, PR): Quiet uses `example.invalid` placeholders and marks every
  page `noindex`; Live emits no canonical/hreflang rather than a guessed one. A Quiet deploy build
  (`CI` + `EMUNAS_DEPLOY`) refuses to run without hosts or `EMUNAS_FEEDBACK_EMAIL`, and
  deploy.yml's "Check configuration" stops earlier still.
- A new domain: follow "Domains and cutover" (§3). The workers.dev URLs keep working, stay
  `noindex`, and their pages canonicalize to `library.<domain>`.

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

**ci.yml** (PRs, merge queue, pushes to main). Jobs run in parallel where they can:

- `check`: pipeline typecheck; `site:typecheck`, which also covers the site Workers and the Live
  search eval suite; lint; the chain script's own tests.
- `unit (api|quiet|live|rest)`: `npm run site:test:<group>`, the four parts of `site:test`
  (Worker/config/`_headers` tests and the eval suite included).
- `build`: corpus:build → guard pre → corpus:build --suppress → `search:build` → Live `data:build`
  (lexical neighbours; no embedding cache in PRs) → Quiet, Live and Home builds → render
  `_headers` → `wrangler deploy --dry-run` for the Workers in both environments, bundling Live and
  Home → guard self-test (a planted `heardAs` file must fail) → guard post-pass over `.corpus`,
  the outputs and the Worker bundles → budgets → Live `data:budgets`. Its outputs go to
  `chain self-test (asr-key|asr-synonym)` (each plant must fail guard post) and to `preview`.
  The Live build therefore ships the real `public/data` in PR builds and previews, exactly as
  deploys do.
- `build-test`: the same chain to the Live build, with the test domain `emunas.example`; its
  outputs feed `live e2e (chromium|webkit)`, `quiet-e2e`, `cross-site` (equivalence, link check,
  html-validate, search eval gate) and `lighthouse`.
- `passed`: needs every job above and fails unless all succeeded; this is the check to require
  on `main`. It then uploads a `ci-passed-<git tree id>` marker, which deploy.yml reads.
- `preview` (same-repo PRs): `wrangler versions upload --env=staging --preview-alias pr-<n>` for
  the sites; the URLs land in the job summary. Without Cloudflare secrets it logs a notice and passes.

`node_modules` and Playwright browsers come from the Actions cache (`.github/actions/setup`,
`.github/actions/playwright`), saved from `main` only.

**deploy.yml** (push to main touching `data/derived`, `data/catalog`, `apps`, `packages`,
`workers`, `site-policy`; manual dispatch with `target: production|staging`):
configuration check (`EMUNAS_MEDIA_ORIGIN` and the Cloudflare secrets) → typecheck, lint and
`site:test`, skipped when ci.yml already uploaded a `ci-passed-<tree id>` marker for this exact
tree → provisioning check (§3)
→ corpus:build (with `EMUNAS_DEPLOY=1`) → guard pre → corpus:build --suppress →
`npm run search:build` → embedding cache mirror (below) → `npm run data:build --workspace=@emunas/live` → Quiet and Live builds →
render `_headers` → Worker bundles (dry run) → guard post (covers the api bundle too) → budgets →
`npm run data:budgets --workspace=@emunas/live` → D1 migrations (`DB_SEARCH`, `DB_FEEDBACK`) →
`npm run search:sync --workspace=@emunas/api -- --env <target>` when that script exists (W3.10) →
deploy `emunas-api` → `emunas-quiet` → `emunas-live` → job summary (full/total, newly full ids, downgrades with reasons, unmapped
counts, suppressed ids; never text). `concurrency: deploy-<target>`, cancel in progress.

**refresh-quiet.yml** (every second day at 05:17 UTC; manual dispatch): rebuilds and deploys Quiet
alone from `main`, so the title page's "this week" window stays current: build day −1…+3, with
the build day taken in America/New_York. Steps: configuration check → corpus:build → guard pre →
corpus:build --suppress → search:build → Quiet build → render `_headers` → guard post over
`.corpus` and `apps/quiet/dist` → budgets → deploy `emunas-quiet`. It skips the tests (main has
passed them), Live, D1/Vectorize and emunas-api. It shares the `deploy-production` concurrency
group without cancelling: a full deploy cancels a refresh, and a refresh waits for a full deploy.
If GitHub's schedule runs late or one run fails, the window still covers the next day. If runs
keep failing, dispatch it by hand or push to `main`.

The data steps between the corpus build and the app builds:

| Script | Reads | Writes | Notes |
|---|---|---|---|
| `npm run search:build` (`@emunas/search-core`) | `.corpus/` (+ `candidateTopics` through the corpus's allow-listed reader) | `.corpus/search/docs.ndjson`, `.corpus/search/moments.ndjson` | the indexed-field allow-list; read by Quiet's Pagefind glue and by `search:sync`. Flags: `--corpus`, `--data-dir`, `--no-keywords` |
| `npm run data:build -w @emunas/live` (`data-build/cli.ts emit`) | `.corpus/` | `apps/live/public/data/` (gitignored), every file validated against the W2.4 contract | must run before the Live build, which copies `public/` into `build/client/`. `--generated-at` defaults to `SOURCE_DATE_EPOCH`, else now |
| `npm run data:budgets -w @emunas/live` (`data-build/cli.ts budgets`) | `apps/live/public/data`, `apps/live/build/client` | nothing (console) | ≤ 18,000 client files, ≤ 25 MiB per file, brotli size targets per data kind (tech-live §3.3). Over a target is a warning; `corpus.json` has a soft target with a 400 KiB hard limit; a hard overrun exits 1 |

All three run after the guard pre-pass and before the guard post-pass, so everything they write is
scanned. None of them reads transcript files.

**"Same idea elsewhere" on real embeddings** (W4.4, `apps/live/data-build/README.md`). Before
`data:build`, deploy.yml restores `.cache/embeddings` from `actions/cache`, then mirrors
`s3://emunas-site-build/emb/<model-slug>/` into it with the runner's `aws s3 sync` over the R2 S3
endpoint (only new blobs are fetched). `<model-slug>` is `EMBED_MODEL` from
`workers/api/wrangler.jsonc` for the target env with `@cf/` dropped and `/` → `--`
(`@cf/baai/bge-m3` → `baai--bge-m3`), the same slug the W3.10 sync writes. When at least one
vector arrives, `data:build` runs with `--neighbors embeddings --embeddings .cache/embeddings
--embed-model <model>`; otherwise it runs with `--neighbors lexical`. The mirror step never fails
the deploy; it logs a `::notice::` and falls back when:

- `EMUNAS_NEIGHBORS=lexical` (the step does not run);
- the `aws` CLI is missing, or R2 credentials cannot be derived (`R2_*` secrets unset and the
  token id lookup fails);
- the sync fails (bucket missing, token without R2 read on `emunas-site-build`);
- the prefix holds no `.f16` yet (eval/sync not run for this model).

With vectors present, `--neighbors embeddings` fails the build if none matches any moment (a model
or text mismatch is a bug, not a fallback case). Moments whose texts are not yet in the cache
(new shiurim: the D1/Vectorize sync that embeds them runs later in the same deploy) are left out of
neighbour lists until the next deploy. The embeddings threshold (0.75) is uncalibrated; calibrate
it once on the real vectors (data-build README step 4) before relying on the lists, or set
`EMUNAS_NEIGHBORS=lexical` until then. The cache holds vectors only; it is not uploaded anywhere.

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
npm run build --workspace=@emunas/quiet && npm run build --workspace=@emunas/live && npm run build --workspace=@emunas/home
export EMUNAS_MEDIA_ORIGIN=https://media.example.org
npx tsx apps/quiet/worker/render-headers.ts apps/quiet/dist/_headers
npx tsx apps/live/worker/render-headers.ts apps/live/build/client/_headers
(cd apps/quiet && npx --yes wrangler@4.156.0 deploy --dry-run --env="")
(cd apps/live && npx --yes wrangler@4.156.0 deploy --dry-run --env="" --outdir ../../.wrangler/bundles/live)
(cd apps/home && npx --yes wrangler@4.156.0 deploy --dry-run --env="" --outdir ../../.wrangler/bundles/home)
npm run guard --workspace=@emunas/corpus-guard -- post --scan .corpus apps/quiet/dist apps/live/build/client apps/home/dist .wrangler/bundles --corpus .corpus
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
| Check configuration | a secret/variable missing for the environment, or `EMUNAS_NEIGHBORS` not `auto`/`lexical` | set it (§4) |
| Check configuration warning "VITE_TURNSTILE_SITE_KEY is not set" | Live builds without a site key; report control hidden | set the variable (§3 Turnstile) |
| Mirror embedding cache (notice "embedding neighbours skipped") | not a failure: no aws CLI, no R2 credentials/scope, or no vectors under `emb/<model>/` | give the token R2 read on `emunas-site-build`, run the W3.10 eval/sync; or set `EMUNAS_NEIGHBORS=lexical` to silence |
| Live static data: "no … vectors … for any of N moments" | mirrored blobs do not match the moment texts or model | check `EMBED_MODEL` vs the cache prefix; rerun the W3.10 sync |
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

## 10. Transcoding the `.WMA` recordings to MP3

Three in-scope recordings exist only as `.WMA`, which browsers do not play. One command (repo root,
R2 credentials in `.env` as for `transcripts:sync`, `ffmpeg`/`ffprobe` on PATH) converts each to MP3
and uploads it next to the original (same key, `.mp3`; the WMA stays):

```sh
npm run transcode:wma --workspace=@emunas/audio -- --dry-run   # list the plan
npm run transcode:wma --workspace=@emunas/audio                # transcode, verify, upload
```

Per key: skip if the `.mp3` already exists (`--force` overwrites), download to a temp dir,
`ffmpeg -codec:a libmp3lame -q:a 4` (mono stays mono, sample rate kept), check the duration with
ffprobe (within 1 s), upload as `audio/mpeg`, then add the original key to
`site-policy/audio-transcoded.json`. Commit that file by PR; the next corpus:build links the MP3
(`playable: true`) for the listed keys only. Keys under `transcripts/` are never touched.

## 11. First deploy checklist

In order; each step names where it is described. Staging first, then production.

**Account and resources (once)**

- [ ] Workers Paid plan on the account (file counts, D1/Vectorize/Workers AI; integration-plan §3.1).
- [ ] Note the workers.dev subdomain (dashboard → Workers & Pages → Subdomain): it becomes
      `EMUNAS_WORKERS_SUBDOMAIN`.
- [ ] D1 `emunas-search`, `emunas-feedback` and their `-staging` twins created; ids committed into
      `workers/api/wrangler.jsonc` by PR (§3). `grep 00000000-0000-4000-8000- workers/api/wrangler.jsonc` prints nothing.
- [ ] Vectorize `emunas-moments(-staging)`, 1,024 dims, cosine, **with the metadata indexes before
      the first upsert** (`workers/api/sync/README.md`).
- [ ] R2 `emunas-site-build` created (private, no public domain).
- [ ] `TURNSTILE_SECRET` and `FEEDBACK_HASH_SALT` put on `emunas-api` for both environments (§3).
      The api Worker must exist before Live can bind to it: the deploy job deploys it first.
- [ ] API token with the scopes in §4 (Workers Scripts/Routes, D1, Vectorize, Workers AI read,
      Account settings read, R2 read/write on `emunas-site-build` only). No access to `emunas`.

**Media (A1)**

- [ ] Custom domain `media.<domain>` on bucket `emunas`, `r2.dev` URL off (§3 Audio).
- [ ] CORS rule set: GET/HEAD, `Range`, the Quiet and Live origins (+ staging) (§3); purge the media
      hostname if mp3s were already cached; the `curl -sI` check returns `206` with
      `access-control-allow-origin`.
- [ ] `.WMA` recordings transcoded (§10) and `site-policy/audio-transcoded.json` merged.

**GitHub (§4)**

- [ ] Environments `production` (required reviewers or "main only") and `staging` created.
- [ ] Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` on both environments and the repository.
- [ ] Variables: `EMUNAS_MEDIA_ORIGIN`, `EMUNAS_WORKERS_SUBDOMAIN`, `EMUNAS_FEEDBACK_EMAIL` at
      repository level; `VITE_TURNSTILE_SITE_KEY` per environment; `EMUNAS_DOMAIN` on
      `production` only, equal to the domain in the `wrangler.jsonc` routes.
- [ ] Optional: `EMUNAS_NEIGHBORS=lexical` until the embeddings threshold is calibrated.
- [ ] Actions settings for data-sync (§4, last paragraph).

**Search data**

- [ ] W3.10 model eval run and its report committed; `EMBED_MODEL` set to the winner in both
      envs of `workers/api/wrangler.jsonc` (this also fills `emb/<model>/` in R2).

**Staging run**

- [ ] Actions → deploy → Run workflow, `target: staging`. Expect: Check configuration green
      (at most the Turnstile warning), provisioning check green, mirror step either "mirrored N
      vectors" or a skip notice, guard post-pass 0 findings, migrations applied, `search:sync`
      upserts, three deploys.
- [ ] Rerun the same dispatch: `search:sync` reports 0 statements and 0 vectors.
- [ ] Guard drill: dispatch `target: staging`, `plant_leak_fixture: true`; the run must stop at
      "Guard post-pass" and deploy nothing.
- [ ] Smoke on `emunas-quiet-staging.<sub>.workers.dev` and `emunas-live-staging.<sub>.workers.dev`:
      `/` (Live redirects to `/yi/` or `/en/`), a shiur page in both editions, audio plays and
      seeks (Range), the response carries `X-Robots-Tag: noindex`, page `<link rel="canonical">`
      points at the staging Quiet host, Quiet → "Open in the listening app" and Live →
      "Printable page" stay on staging, search returns results, "report a problem" submits (or is
      hidden when no site key is set), an offline download completes (CORS).

**Production run**

- [ ] Merge to `main` (or dispatch `target: production`) and approve the environment.
- [ ] Custom Domains attached (§3 "Domains and cutover"): `<domain>` on
      `emunas-home`, `library.<domain>` on `emunas-quiet`, `listen.<domain>` on `emunas-live`,
      `media.<domain>` on `emunas`; each answers over https.
      `https://media.<domain>/transcripts/<any key>.json` returns 404.
- [ ] Same smoke as staging on the production hosts: `https://library.<domain>/robots.txt` names
      the sitemaps, Quiet pages are self-canonical without `noindex`, and Live pages canonicalize
      to `https://library.<domain>/…`. `https://<domain>/files/essays/<slug>.pdf` serves a PDF.
- [ ] Access application on `listen.<domain>/admin/*` and `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` set;
      `/admin/feedback` asks for login.
- [ ] Note the deployed version ids (`wrangler deployments list`) for rollback (§7).
