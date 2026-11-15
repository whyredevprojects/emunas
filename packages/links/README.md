# @emunas/links

URL builders for both sites, cross-site equivalents, canonical and hreflang helpers, host
config. Implements integration-plan §2 (W1.8). Pure and browser-safe: no Node APIs, no DOM,
no globals (`test/purity.test.ts` checks this).

Audio URLs are not built here: they come from `recordings[].audioUrl` in the corpus, on
the media host (Amendment A1). There is no `/audio/*` route on either site.

## Model

Both sites' paths parse into one site-neutral `Route` (`parseQuiet`, `parseLive`) and format
back (`formatQuiet`, `formatLive`). Every cross-site mapping is "parse on one site, format on
the other". Time is global seconds (C5), written as whole seconds.

| Thing | Quiet | Live |
|---|---|---|
| Home | `/{ed}/` | `/{ui}/` |
| Shiur | `/{ed}/shiur/{id}/` | `/{ui}/s/{id}` |
| Section i | `/{ed}/shiur/{id}/#s{i}` | `/{ui}/s/{id}?t={sectionStart}&m={id}~s{i}` |
| Time t | `/{ed}/shiur/{id}/#t={t}` | `/{ui}/s/{id}?t={t}` |
| Series | `/{ed}/series/{id}/` | `/{ui}/series/{id}` |
| Parsha / Zman | `/{ed}/calendar/{parsha,zman}/{key}/` | `/{ui}/o/{key}` |
| Work / Person / Concept | `/{ed}/{sources,people,inyanim}/{key}/` (index anchor `/{ed}/people/#{key}` below threshold) | `/{ui}/{seforim,p,c}/{key}` |
| Search | `/{ed}/search/?q=` | `/{ui}/search?q=` |

## Use

```ts
import { createLinks, hostsFromEnv, quietPaths, livePaths } from "@emunas/links";

// Same-site links: root-relative paths.
const q = quietPaths({ entityCount }); // entityCount from .corpus/entities.json
q.shiur("yi", id, { section: 2 });     // "/yi/shiur/<id>/#s2"
q.person("en", "baal-shem-tov");      // page, or "/en/people/#baal-shem-tov" below 2 shiurim

// Cross-site, canonical, hreflang: absolute URLs.
const links = createLinks({
  hosts: hostsFromEnv(env), // EMUNAS_DOMAIN | EMUNAS_WORKERS_SUBDOMAIN (+ EMUNAS_STAGE) | EMUNAS_{QUIET,LIVE}_ORIGIN
  data: { entityCount, occasionKind, sectionStart }, // all optional lookups from .corpus/
});
links.live.shiur("en", id, { t: player.currentTime }); // "Open in the listening app"
links.equivalent(url);       // the same page on the other site (Live-only params dropped)
links.canonicalFor(liveUrl); // always the Quiet origin, never a fragment
links.hreflangPair(path);    // yi + en + x-default (site root)
links.withEdition(url, "yi"); // edition switch that keeps the place
```

### Lookups (`LinkData`)

| Lookup | Needed for | Without it |
|---|---|---|
| `entityCount(kind, key)` | Quiet entity page vs index anchor (works/people ≥2, concepts ≥3) | the page is assumed to exist |
| `occasionKind(key)` | Live `/o/{key}` → Quiet parsha or zman page | Quiet edition home |
| `sectionStart(id, i)` | Quiet `#s{i}` → Live `?t=` | Live link carries only `m=` |

### Hosts

Production: Quiet on the apex `https://<domain>`, Live on `https://listen.<domain>`. Before the
domain exists (O8) and on staging: `emunas-quiet[-staging].<subdomain>.workers.dev` and
`emunas-live[-staging].<subdomain>.workers.dev`. `isIndexableOrigin()` is false for
workers.dev, localhost and IPs (send `X-Robots-Tag: noindex`). A Quiet origin on `listen.*`
is rejected, so a canonical can never point at Live.

Pages that exist on one site only map to the closest page on the other (Live Explore and
shelf → Quiet edition home; Quiet contents, years, about → Live UI home; seforim ↔ sources,
maasios ↔ stories). Unknown paths fall back to the edition home, else the root.
