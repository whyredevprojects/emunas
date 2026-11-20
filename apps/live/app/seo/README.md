# Live prerender and SEO (`app/seo`, W4.5)

Integration-plan §2.3: Live pages are never the indexable copy of a shiur. Every page carries
`<link rel="canonical">` to its Quiet equivalent (`@emunas/links` `canonicalFor`, never a
`analyze.*` URL); content pages (shiur, series, occasion, work, person, concept) add `hreflang`
alternates and OpenGraph/Twitter tags; app-only pages (Today, Explore, search, shelf, playlists,
listings, unknown paths and the SPA fallback) are `noindex`. `robots.txt` allows all and disallows
`/api/` and `/admin/`. No sitemap.

| File | Role |
|---|---|
| `policy.ts` | Live path → page kind; which kinds are indexable / app-only |
| `model.ts` | `SeoCorpus`, the prerender route list, `@emunas/links` lookups, per-page title/description |
| `strings.ts` | Description templates (catalog values and entity names only, never transcripts) |
| `head.ts` | `SeoPage` (build time) and the head tags for a path (`headTags`) |
| `SeoHead.tsx` | Renders `headTags` in the root `<head>` (from the root loader data) |
| `meta.ts` | `seoMeta`: route `meta` exports; `<title>` = the page's own name on prerendered content pages (W5.4) |
| `corpus.server.ts` | Reads `.corpus/` (index.json and the aggregate files) |
| `loader.server.ts` | The root route `loader`: runs at build time only (`ssr: false`) |
| `config.server.ts` | `prerender` and `buildEnd` hooks for `react-router.config.ts` |
| `check.server.ts` | Post-build: robots.txt, `.data` cleanup, `<path>.html` layout, acceptance checks |

## Prerendered routes

Per UI language: Today (`/en`, `/yi`), every shiur (`/s/<id>`), series, occasion with ≥2 shiurim
(the ones with a data file), and from the corpus layer's Live page flags (C1.7; `app/data/live-pages.ts`)
every topic (`/t/`), thread of ≥3 shiurim (`/th/`), story told at least twice (`/maasios/<id>`), and
work, person and concept with a Live page, by corpus id. Without a layer the entity routes come from
`.corpus/entities.json` (`livePrerender`).

Corpus entries (topic, story, person, concept, sefer) canonicalize to their Quiet page when Quiet
has one; otherwise the page has no canonical and is `noindex` (`@emunas/links` `canonicalFor` /
`noindexFor` over the layer's page flags). Thread pages are always `noindex` with no canonical
(D8), and their share description never quotes the generated summary (E.5). When `public/data/` exists, routes whose data file was not
emitted are skipped. On the real data (2026-11-15): 4,570 pages, 8,881 files in `build/client`
(budget 18,000).

`/` is not prerendered: the site Worker redirects it, and without it React Router writes the SPA
fallback as `index.html`, which is what Cloudflare's `not_found_handling: "single-page-application"`
serves. Pages other than the UI homes are moved to `<path>.html` so `/en/s/x` is served directly
under the default `html_handling` (no redirect to `/en/s/x/`).

The root loader makes React Router write a `.data` file per page; nothing requests them (a loader
on a param-less route never revalidates under `ssr: false`), so `buildEnd` removes them, unless
another route module exports a server `loader`.

## Build configuration

- `EMUNAS_DOMAIN` (or `EMUNAS_WORKERS_SUBDOMAIN` [+ `EMUNAS_STAGE`], or `EMUNAS_QUIET_ORIGIN` +
  `EMUNAS_LIVE_ORIGIN`; `VITE_`-prefixed spellings also work). Without hosts the build emits no
  canonical/hreflang rather than a guessed origin, and says so.
- `EMUNAS_CORPUS_DIR` (default: the nearest `.corpus/` above `apps/live`). Without a corpus only
  Today is prerendered; with `EMUNAS_DEPLOY=1` that is an error.

`buildEnd` fails the build when a prerendered page lacks a Quiet canonical (hosts configured), OG
title/description on a content page, a `<title>` carrying the page's name (`og:title`) on a content
page, `noindex` on an app-only page, or when `build/client` holds
more than 18,000 files.
