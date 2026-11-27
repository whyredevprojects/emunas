# Ops runbook: the sites on Cloudflare

How the landing site ("home", on the apex `<domain>`), the Quiet site (the library,
`library.<domain>`), the Live site (`analyze.<domain>`) and the `emunas-api` Worker are provisioned, configured, deployed and rolled back. Source of truth for the design:
`integration-plan.md` §3 and §4, as changed by **Amendment A1** (audio is served straight from
R2 on `media.<domain>`; there is no audio Worker route, no `AUDIO_ENABLED` switch and no
`audio-publish` workflow). The custom domain is on the `emunas` bucket itself. That bucket also
holds `transcripts/` and `site/files/`; they are reachable by key on the media host, which is
accepted (owner decision): nothing the sites publish ever links to them.

`<domain>` is `EMUNAS_DOMAIN`: `emunas.com`. Every
host is derived from it (`@emunas/links` `productionHosts`), so the move is a config change only
(§3 "Domains and cutover").

Nothing here has been run against a real account yet. The configs are validated with
`wrangler deploy --dry-run` and the workflows with `actionlint`; the first real deploy is part
of W6.1 and follows the checklist in §12. Every GitHub variable and secret is listed in §4.

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

- `GET|HEAD /` → `302` to `/<ui>/` for a `UI_LANGS` language (`/en/`, `/yi/`, `/he/`; query kept).
  Order: cookie `emunas_ui=<ui>` (written by the Live app when the reader picks a language), then
  `Accept-Language` (highest q; `ji` → `yi`, `iw` → `he`), else `en`. `Cache-Control: private, no-store`,
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
| CSP | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-…' (theme init script); style-src 'self'; media-src 'self' <media>; connect-src 'self'; frame-ancestors 'none'; …` | as Quiet, plus Turnstile in `script-src`/`frame-src`; `script-src`/`style-src` also allow `'unsafe-inline'` because React Router's prerendered HTML carries per-page inline bootstrap scripts |
| immutable | `/_astro/*` | `/assets/*` |
| other caching | `/fonts/*` one day + SWR (font names are not hashed), `/pagefind/*` 1 h | `/data/*` 5 min + SWR 1 day |
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
2. No CORS rule is needed. Plain `<audio src>` playback and plain download links send no `Origin`
   (neither site sets `crossorigin`), and no site `fetch()`es audio: Live has no service worker
   (removed 2026-11-19, integration-plan W4.8). A CORS rule set earlier for Live's offline downloads
   is harmless and can be removed in the dashboard (R2 → `emunas` → Settings → CORS policy).
3. Set `EMUNAS_MEDIA_ORIGIN=https://media.<domain>` as a GitHub variable (below).

### Domains and cutover

| Host | Worker / service | `wrangler.jsonc` route (top level only; `env.staging` has `"routes": []`) |
|---|---|---|
| `<domain>` | `emunas-home` | `[{ "pattern": "<domain>", "custom_domain": true }]` |
| `library.<domain>` | `emunas-quiet` | `[{ "pattern": "library.<domain>", "custom_domain": true }]` |
| `analyze.<domain>` | `emunas-live` | `[{ "pattern": "analyze.<domain>", "custom_domain": true }]` |
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
   `apps/live/wrangler.jsonc` to `<new>`, `library.<new>`, `analyze.<new>` (PR; the
   routes test must pass).
3. Set the GitHub variable `EMUNAS_DOMAIN=<new>` on `production` and
   `EMUNAS_MEDIA_ORIGIN=https://media.<new>` (§4).
4. R2 → `emunas` → Custom Domains: add `media.<new>`.
5. Turnstile widget: add `analyze.<new>`. Access application: add `analyze.<new>/admin/*`.
6. Deploy production (§5). The deploy attaches the Custom Domains; check each host (§12
   production smoke).
7. Keep the old hosts attached until the new ones are verified, then remove their routes. Once the
   old routes are gone, remove `media.<old>` from `emunas`.

Old `emunas.com` addresses (the Weebly site's page and file paths) are not preserved and are not
redirected.

Turnstile: one widget for `analyze.<domain>` (dashboard → Turnstile → Add widget, hostname
`analyze.<domain>`, mode Managed). Its **site key** is public and goes to the GitHub variable
`VITE_TURNSTILE_SITE_KEY` on the `production` environment (Vite bakes it into the Live build); its
**secret** goes to `TURNSTILE_SECRET` on `emunas-api`. For staging either add the staging Live
host (`emunas-live-staging.<sub>.workers.dev`) to the same widget and use the same pair, or use
Cloudflare's always-pass test pair (site key `1x00000000000000000000AA`, secret
`1x0000000000000000000000000000000AA`) on the `staging` environment and `emunas-api-staging`.
Without a site key a deployed Live build hides the "report a problem" control (deploy.yml warns).
Access: a self-hosted application on `analyze.<domain>/admin/*` for the owner; put its team domain
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
| variable | `EMUNAS_DOMAIN` | environment `production` **only** (see "Staging vs production hosts") | one of these two | home build (links to the library and the listening app); Quiet build (canonical, hreflang, sitemaps, robots.txt, OG, cross-site links); Live build (canonical to Quiet, hreflang) | the apex, e.g. `emunas.com` (home = apex, Quiet = `library.` + it, Live = `analyze.` + it). Must match the `wrangler.jsonc` routes (§3) |
| variable | `EMUNAS_WORKERS_SUBDOMAIN` | repository | one of these two | same, for the workers.dev hosts | the `<sub>` in `emunas-quiet.<sub>.workers.dev` (dashboard → Workers → Subdomain) |
| variable | `EMUNAS_HOME_ORIGIN`, `EMUNAS_QUIET_ORIGIN`, `EMUNAS_LIVE_ORIGIN` | not set in GitHub | no | local builds only: explicit origins override the derived ones | e.g. `http://localhost:4321`. Without a domain or subdomain, code that needs all three hosts (`hostsFromEnv`) needs all three set; Live SEO (`siteHostsFromEnv`) needs only Quiet and Live |
| variable | `EMUNAS_FEEDBACK_EMAIL` | repository or each environment | yes | Quiet "report an error" `mailto:` (C18) | one plain address |
| variable | `VITE_TURNSTILE_SITE_KEY` | environment `production`; `staging` (own widget or test key) | no (warning) | Live build: feedback dialog's Turnstile widget (W4.7) | the widget's public site key. Unset: the report control is hidden on deployed hosts |
| variable | `EMUNAS_NEIGHBORS` | repository (optional) | no | deploy.yml "same idea elsewhere" | `auto` (default: real embeddings when the R2 cache can be mirrored, else lexical) or `lexical` (skip the mirror) |
| variable | `EMUNAS_EMBED_BUCKET` | repository (optional) | no | deploy.yml embedding mirror | default `emunas-site-build` |
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
| production | set | any | `https://<domain>` / `https://library.<domain>` / `https://analyze.<domain>` |
| staging | unset **for staging** | set | `https://emunas-{home,quiet,live}-staging.<sub>.workers.dev` |
| staging (misconfigured) | set, no subdomain | unset | production origins: staging pages would link and canonicalize to production |

So: set `EMUNAS_WORKERS_SUBDOMAIN` at repository level and `EMUNAS_DOMAIN` on the `production`
environment only. With both visible to staging the subdomain wins for staging (staging hosts), but
keeping the domain off staging makes that explicit.

What this means for search engines:

- Quiet is the canonical copy. Its pages are self-canonical with an `hreflang` alternate per
  edition (en, yi, he) plus x-default, and a sitemap per edition; Live pages carry `<link rel="canonical">` to the Quiet equivalent and no
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
  It checks out the full workspace and installs `node_modules` (`.github/actions/setup`), because
  wrangler bundles the Live and Home Workers from source and they import workspace packages
  (`@emunas/i18n`). A failed upload fails the job (`pipefail`), after the other apps were tried.

`node_modules` and Playwright browsers come from the Actions cache (`.github/actions/setup`,
`.github/actions/playwright`), saved from `main` only. The browsers' system libraries are apt
packages: `.github/actions/playwright` also caches the downloaded `.deb` files (any branch, keyed by
Playwright version, browser set and a hash of the file list) and seeds apt's cache with them, so apt
only downloads packages whose version changed. Without it a slow Ubuntu mirror once made the WebKit
download (~126 MB) outlast the 30-minute job timeout.

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

Pipeline data reaches `main` the same way code does: a pull request from the working branch.

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
- Data: revert the data commit on `main`; the next deploy rebuilds.
- Stop everything: disable deploy.yml in the Actions tab.

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

### Known CI failures that can come back

These have failed before for reasons other than a bug, and are likely to fail again. Check this list before
debugging from scratch.

**Search eval regression gate** (ci.yml `cross-site`: "fail on a drop of more than 5 points")
- *Why it fails:* the expected shiur ids in `apps/live/tests/eval/queries.json` are frozen, but
  `data/` keeps growing through pipeline merges. New on-topic shiurim count as misses and there are
  more distractors, so recall@10 and MRR fall without any change to the search code. First seen
  2026-11-16: the corpus grew from 36,595 to 59,512 moments, and the drop was ~10 points recall
  and ~12 points MRR.
- *How to tell it's the data, not a regression:* the moment count in the header of
  `apps/live/tests/eval/report.md` is well below the current corpus, and `git log` shows no
  search change since the baseline (`packages/search-core`, the Live search code). If unsure,
  run the baseline commit's code on today's data. A matching score means it's the data.
- *Quick fix:* regenerate the baseline. Never loosen the 5-point threshold.
  ```bash
  EMUNAS_MEDIA_ORIGIN=https://media.example.invalid EMUNAS_DOMAIN=emunas.example npm run site:chain -- --to search-build
  npx tsx apps/live/tests/eval/run.ts --embedder fake
  ```
  Commit `report.json` and `report.md`, and give the old and new numbers in the commit message.
- *Lasting fix (not done yet):* `run.ts --refresh` re-resolves the expected ids from the selectors
  and rewrites `queries.json`. It added 305 ids (800 → 1105) on 2026-11-16. That changes what the
  gate measures, so make it a deliberate decision. Then do it on every large data merge, or in CI
  before the gate.

**Live e2e: multi-page axe tests time out** (`shell.spec` stubs, `explore.spec` lenses, `browse.spec`)
- *Why it fails:* each test loads and scans several pages. With 4 Playwright workers on the 4-vCPU
  runner, each page takes 2–3× longer than on an idle machine. The tests get `axeBudget(pages)`
  (`apps/live/test/e2e/helpers.ts`): 8 s per page, at least 30 s.
- *Fix:* if they time out again (more pages, a slower runner), raise `AXE_PAGE_MS`. Don't drop
  pages from the scan.

**Live e2e: mirroring on mobile** (`shell.spec` "yi is the mirror image of en", mobile projects)
- *Why it fails:* on a phone the header holds the site name, one link per other interface language,
  the Language button and the dark-colours toggle. When they no longer fit one row in one language
  (English is the widest: "Emunas", "Language") the tools wrap to a second row there but not in
  Yiddish, and every header box is ~52 px lower in `en` than in `yi`. First seen 2026-11-18, when
  Hebrew added a second language link: `en` needed 392 px of the 380 px row on Pixel 7.
- *Fix used:* tighter spacing for the header tools and the language links below 36rem
  (`apps/live/app/shell/Shell.module.css`): `en` now needs 344 of 358 px on iPhone 14 (390 px).
  If a language or a longer label comes back over, measure the row (brand + gap + `.headerTools`)
  against the viewport minus the header padding; don't drop the test or the tap minimum.

**Live e2e: the real-data series spec times out** (`today-series.spec` "every series page lists its parts")
- *Why it fails:* it loads every series page (and the perek view of perakim series) in one test. On real
  data that is 18 page loads; in WebKit on the 4-vCPU runner they overran the 30 s default (first seen
  2026-11-19, PR #15).
- *Fix:* the test calls `navBudget(pages)` (`NAV_PAGE_MS` = 5 s per page). If it times out again with
  more series, raise `NAV_PAGE_MS`. Don't drop series from the check.

**Live first-load gate: each Today file ≤ 30 KiB** (`first-load.spec`)
- *What it checks:* Today loads one file, the one for its reading language: `today.<lang>.json`, one
  per UI language (`today.en.json`, `today.yi.json`, `today.he.json`). Each must be ≤ 30 KiB brotli.
- *Why it fails:* the gate counts brotli bytes, which is what production serves. The plain-HTTP test
  server gives WebKit gzip only, which is ~6% larger, so a gzip-based measurement fails first.
  If the gate fails on brotli bytes, that Today file has really outgrown its budget.
- *Fix:* that is a product or data-size question. Don't raise the budget silently.
- *Also fails in* `data:budgets` ("today.<lang>.json: … bytes br > 30720 (today target)") and in the
  Live data-build real-data test, which use the same 30 KiB target per file at brotli quality 5. The
  real-data test logs the size of each Today file.
- *Seen 2026-11-18, Hebrew:* once the Hebrew overlays were current, every generated text in the
  single `today.json` carried `he` as well as `en`/`yi`, which took it from 29,278 to 32,068 bytes br.
  *Fixed* by splitting it into one Today file per UI language (`LIVE_DATA_SCHEMA_VERSION` 8). In
  each file, every generated text (one-liners, mix section titles) is a `{ lang, text }` holding only
  the text that reader is shown: the first present language along `CONTENT_FALLBACK[lang]`, with
  the language it is in, so the page gives it the right `lang`/`dir`. The Today page fetches the file
  for the reading language and fetches again when the language changes. On the real data
  (2026-11-18): en 26,161, yi 25,962, he 25,379 bytes br. A new UI language adds a file of about the
  same size; it does not grow the others.
- *If it comes back:* find out which file is over and what grew (`data:budgets` names the largest).
  More occasions with a mix, longer titles or more cards grow every file alike. Look at
  `EMIT_LIMITS` in `apps/live/data-build/emit.ts` (`todayMixFirst`, `todayPoolPerOccasion`,
  `newlySummarized`) and `TODAY_ROW_PER_LANG` before you touch the budget.

**Live data budgets: `writeup/<id>.<lang>.json` over its brotli target** (`real-data.test.ts`, `unit (live)`)
- *Why it fails:* a write-up's length follows its shiur's length (800–1,000 words per hour,
  `scripts/lib/budget.ts`), so the longest shiur sets the size of the largest write-up file. The
  target was 8 KiB until the Purim seudos (up to 4.2 h) came into scope on 2026-11-18 and reached
  11,162 B; it is now 13 KiB (`apps/live/data-build/budgets.ts`).
- *Fix:* check the overrun is a long shiur, not a write-up past its own word budget
  (`npm run -s writeup:budget -- <shiurId>`). If the shiur is long, raise the target to the new
  largest file plus ~20% and update the comment. If not, fix the write-up in the pipeline.

**Quiet Lighthouse: LCP over 1.8 s on `/en/sources/`** (ci.yml `lighthouse`)
- *Why it fails:* the works index is one long page, and its LCP follows its HTML size. Works with
  no page list their shiurim inline, by title. It went over twice on 2026-11-17/18: once when the
  citations gained titles and dates, and again when the 37 Purim seudos added citations.
- *How to tell:* compare the size of `apps/quiet/dist/en/sources/index.html` with the last green
  run. Find the largest blocks: one `<section class="index-block">` per group, then count
  `class="cite"` in each.
- *Fix:* keep the inline lists short. Generic labels give a count only above
  `GENERIC_LINE_MAX_SHIURIM` (`components/indexes/works.ts`), and index pages show titles only
  (`CiteList` `brief`). Don't raise the 1.8 s budget.

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

## 11. AI-improved audio: checking the copies and recording a rejection

Every playable recording is linked with a second URL, `cleanedUrl`, pointing at its AI-improved
copy at `fixed/sidon/<served key>` in the `emunas` bucket (the served key is the linked `.mp3`, so
the transcode for the three `.WMA` recordings). The build does not look in R2: it assumes the copy
exists unless the served key is listed in `site-policy/audio-cleaned.json` `rejected`. Design and
owner decisions: `docs/sites/cleaned-audio-ux.md`. Downloads always use the original.

**Before merging anything that relies on the copies** (and after the improved copies are
re-generated), run from the repo root, with the R2 credentials in `.env` as for `transcode:wma`:

```sh
npm run cleaned:verify --workspace=@emunas/audio                         # listing only
npm run cleaned:verify --workspace=@emunas/audio -- --verify-duration    # also download + ffprobe each copy
```

It reads `data/derived/ingest.json` (read-only) and `site-policy/audio-{transcoded,cleaned}.json`,
lists `fixed/sidon/`, and prints:

| Line | Meaning | Fails the run |
|---|---|---|
| `MISSING <key>` | An in-scope recording, not rejected, has no copy. The site would link a 404 (players fall back to the original once, but fix it). | yes |
| `EMPTY <key>` | The copy is a 0-byte object. | yes |
| `BAD <key>: …` | `--verify-duration` only: not `audio/mpeg`, unreadable, or the duration differs from the original by more than 0.5 s (chapter times would drift). | yes |
| `stray <key>` | An object under the prefix that matches no recording (a typo'd key, an old upload). | no |
| `rejected <key> (…)` | A listed rejection; the site does not link it whether or not the object exists. | no |

Credentials are never printed. `--verify-duration` downloads every copy (and the original when
the ingest has no duration), so it is slow; run it once per regeneration, not on every PR.

**Recording a rejection.** When a listener's report or a review finds that a copy changed how a word
sounds (or is otherwise wrong), the whole recording is rejected; there are no partial rejections.
Add an entry by PR:

```json
{
  "policyVersion": 1,
  "rejected": [
    { "key": "<served key, exactly as in the bucket, without fixed/sidon/>", "reason": "a word changed at 12:40", "reviewedBy": "<name>", "reviewedAt": "YYYY-MM-DD" }
  ]
}
```

The next corpus:build emits `cleanedUrl: null` for that recording (and its duplicates), so both
sites play only the original and show no version line. The build fails on a key that is not the
served `.mp3` key of a known recording, on a key listed twice, and on an empty `reason` or
`reviewedBy`. The key is a bucket key: it stays in `site-policy/` and never reaches public output.
To lift a rejection after the copy is regenerated, remove the entry and re-run `cleaned:verify`.

## 12. First deploy checklist

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
- [ ] `.WMA` recordings transcoded (§10) and `site-policy/audio-transcoded.json` merged.

**GitHub (§4)**

- [ ] Environments `production` (required reviewers or "main only") and `staging` created.
- [ ] Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` on both environments and the repository.
- [ ] Variables: `EMUNAS_MEDIA_ORIGIN`, `EMUNAS_WORKERS_SUBDOMAIN`, `EMUNAS_FEEDBACK_EMAIL` at
      repository level; `VITE_TURNSTILE_SITE_KEY` per environment; `EMUNAS_DOMAIN` on
      `production` only, equal to the domain in the `wrangler.jsonc` routes.
- [ ] Optional: `EMUNAS_NEIGHBORS=lexical` until the embeddings threshold is calibrated.

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
      `/` (Live redirects to `/<ui>/`), a shiur page in every edition, audio plays and
      seeks (Range), the response carries `X-Robots-Tag: noindex`, page `<link rel="canonical">`
      points at the staging Quiet host, Quiet → "Open in the listening app" and Live →
      "In the Library" stay on staging, search returns results, "report a problem" submits (or is
      hidden when no site key is set), the Download link saves the mp3.

**Production run**

- [ ] Merge to `main` (or dispatch `target: production`) and approve the environment.
- [ ] Custom Domains attached (§3 "Domains and cutover"): `<domain>` on
      `emunas-home`, `library.<domain>` on `emunas-quiet`, `analyze.<domain>` on `emunas-live`,
      `media.<domain>` on `emunas`; each answers over https.
      `https://media.<domain>/transcripts/<any key>.json` returns 404.
- [ ] Same smoke as staging on the production hosts: `https://library.<domain>/robots.txt` names
      the sitemaps, Quiet pages are self-canonical without `noindex`, and Live pages canonicalize
      to `https://library.<domain>/…`. `https://<domain>/files/essays/<slug>.pdf` serves a PDF.
- [ ] Access application on `analyze.<domain>/admin/*` and `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` set;
      `/admin/feedback` asks for login.
- [ ] Note the deployed version ids (`wrangler deployments list`) for rollback (§7).
