# @emunas/links

URL builders for both sites, cross-site equivalents, canonical and hreflang helpers, host
config. Implements integration-plan §2 (W1.8). Pure and browser-safe: no Node APIs, no DOM,
no globals, no imports but `@emunas/i18n` (`test/purity.test.ts` checks this).

Audio URLs are not built here: they come from `recordings[].audioUrl` in the corpus, on
the media host (Amendment A1). There is no `/audio/*` route on either site.

## Model

Both sites' paths parse into one site-neutral `Route` (`parseQuiet`, `parseLive`) and format
back (`formatQuiet`, `formatLive`). Every cross-site mapping is "parse on one site, format on
the other". Time is global seconds (C5), written to the millisecond (`582.12`) in both Quiet's `#t=` and Live's `?t=`.

| Thing | Quiet | Live |
|---|---|---|
| Home | `/{ed}/` | `/{ui}/` |
| Shiur | `/{ed}/shiur/{id}/` | `/{ui}/s/{id}` |
| Section i | `/{ed}/shiur/{id}/#s{i}` | `/{ui}/s/{id}?t={sectionStart}&m={id}~s{i}` |
| Time t | `/{ed}/shiur/{id}/#t={t}` | `/{ui}/s/{id}?t={t}` |
| Catalog section | `/{ed}/section/{slug}/` (`quietPaths().section(ed, {source, id})`; slug = id for the Pocket Guide, `unc-` + id otherwise) | none: maps to the UI home |
| Series | `/{ed}/series/{id}/` | `/{ui}/series/{id}` |
| Parsha / Zman | `/{ed}/calendar/{parsha,zman}/{key}/` | `/{ui}/o/{key}` |
| Topic tree / topic | `/{ed}/inyanim/` · `/{ed}/inyanim/{topicId}/` (+ `all/`) | Explore map `/{ui}/explore` · `/{ui}/t/{topicId}` |
| Glossary / concept | `/{ed}/erachim/` · `/{ed}/erachim/{conceptId}/` | `/{ui}/c/{conceptId}` |
| Person | `/{ed}/people/{personId}/` (+ `all/`) | `/{ui}/p/{personId}` |
| Work | `/{ed}/sources/{workId}/` | `/{ui}/seforim/{workId}` (+ `/{chapter}`) |
| Story | `/{ed}/stories/{storyId}/` | `/{ui}/maasios/{storyId}` |
| Thread | none in this cut → `/{ed}/#indexes` | `/{ui}/th/{threadId}` (noindex, D8) |
| Search | `/{ed}/search/?q=` | `/{ui}/search?q=` |

### Corpus entries (corpus-wave-plan §3.5, C1.4)

Corpus-wide entities parse into `{ kind: "entry", entry: CorpusKind, id, all? }` and are addressed by
corpus id. `ענינים` (`inyanim`) now names the topic tree; concepts are glossary entries under
`erachim`. All of them are AI-generated and unreviewed: label them as the addenda say (the
wording is in `@emunas/i18n`, `CORPUS_LABELS`).

- **Pages** come from the layer's page flags: `pageLookupFromLayer({ topics, concepts, people,
  works, stories, threads })` (the `.corpus/layer/*.json` files; each optional) gives
  `LinkData.hasPage(site, kind, id)` and `conceptTopic(id)`. Without flags an entry is assumed to
  have a page.
- **Below threshold**: Quiet links the index anchor (`/{ed}/erachim/#{id}`); Live has no link
  (`hrefFor("live", route)` and `equivalent()` return null).
- **Merged concept**: a concept with `mergedIntoTopic` formats as its topic on both sites.
- **Canonical**: a Live entry page points at its Quiet page when Quiet has one; otherwise
  `canonicalFor` is null and `noindexFor` is true. Threads always: null and noindex.
- **No old addresses**: the sites have never been published, so there are no redirects, legacy
  paths or retired-id mappings here.
  The normalize-keyed `{ kind: "entity" }` route, `quietPaths().concept()` and the `entityCount`
  fallback were retired in C3.1.

## Use

```ts
import { createLinks, hostsFromEnv, pageLookupFromLayer, quietPaths, livePaths } from "@emunas/links";

// Same-site links: root-relative paths.
const q = quietPaths(pageLookupFromLayer(layerFiles)); // page flags from .corpus/layer/
q.shiur("yi", id, { section: 2 });     // "/yi/shiur/<id>/#s2"
q.person("en", "baal-shem-tov");      // page, or "/en/people/#baal-shem-tov" without a Quiet page

// Cross-site, canonical, hreflang: absolute URLs.
const links = createLinks({
  hosts: hostsFromEnv(env), // EMUNAS_DOMAIN | EMUNAS_WORKERS_SUBDOMAIN (+ EMUNAS_STAGE) | EMUNAS_{HOME,QUIET,LIVE}_ORIGIN
  data: { ...pageLookupFromLayer(layerFiles), occasionKind, sectionStart }, // all optional lookups from .corpus/
});
links.live.shiur("en", id, { t: player.currentTime }); // "Open in the listening app"
links.equivalent(url);       // the same page on the other site (Live-only params dropped)
links.canonicalFor(liveUrl); // the Quiet origin, never a fragment; null for threads and no-Quiet-page entries
links.noindexFor(liveUrl);   // true exactly when a Live entry page has no canonical
links.hreflangAlternates(path); // every edition (en, yi, he) + x-default (site root)
links.withEdition(url, "he"); // edition switch that keeps the place
```

### Editions

The editions (`{ed}` on Quiet, `{ui}` on Live) are `UI_LANGS` of `@emunas/i18n` (en, yi, he),
its one runtime import (`test/purity.test.ts` allows only that). `Ed` is `UiLang`, `EDS` is
`UI_LANGS` and `isEd` is `isUiLang`: parsing, the builders' checks, `hreflangAlternates` and
`withEdition` all follow that list, so a language added there is an edition here with no change.

### Lookups (`LinkData`)

| Lookup | Needed for | Without it |
|---|---|---|
| `hasPage(site, kind, id)` | corpus entry page vs index anchor (Quiet) or no link (Live); canonical/noindex | the page is assumed to exist |
| `conceptTopic(id)` | concept merged into a topic → the topic | the concept's own address |
| `occasionKind(key)` | Live `/o/{key}` → Quiet parsha or zman page | Quiet edition home |
| `sectionStart(id, i)` | Quiet `#s{i}` → Live `?t=` | Live link carries only `m=` |

### Hosts

Three sites, one domain `<d>` (`EMUNAS_DOMAIN`):

| Site | Production | workers.dev (before the domain, and staging) |
|---|---|---|
| home (landing site, essays, files) | `https://<d>` | `emunas-home[-staging].<subdomain>.workers.dev` |
| Quiet (library, canonical) | `https://library.<d>` | `emunas-quiet[-staging].<subdomain>.workers.dev` |
| Live (listening app) | `https://listen.<d>` | `emunas-live[-staging].<subdomain>.workers.dev` |

Media (R2) is `media.<d>`, set separately as `EMUNAS_MEDIA_ORIGIN`. Every host derives from
`EMUNAS_DOMAIN`, so moving to another domain is a config change only.

- `hostsFromEnv(env)` gives all three (`Hosts`). Explicit origins (`EMUNAS_HOME_ORIGIN`,
  `EMUNAS_QUIET_ORIGIN`, `EMUNAS_LIVE_ORIGIN`) override the derived ones; without a domain or
  subdomain all three must be set.
- `siteHostsFromEnv(env)` gives only Quiet and Live (`SiteHosts`), for code that never links to
  home; it does not need `EMUNAS_HOME_ORIGIN`.
- `createLinks` takes `SiteHosts` (a full `Hosts` works too): cross-site links, canonical and
  hreflang are between Quiet and Live only.
- `validateHosts` requires every origin it is given to be distinct and rejects a Quiet origin on
  `listen.*`, so a canonical can never point at Live. `productionHosts` rejects a domain that
  starts with `library.`, `listen.` or `media.` (it must be the apex).
- `isIndexableOrigin()` is false for workers.dev, localhost and IPs (send `X-Robots-Tag: noindex`).

Pages that exist on one site only map to the closest page on the other (Live Explore → the
Quiet topic tree; shelf → Quiet edition home; Quiet contents, years, about → Live UI home; seforim ↔ sources,
maasios ↔ stories). Unknown paths fall back to the edition home, else the root.
