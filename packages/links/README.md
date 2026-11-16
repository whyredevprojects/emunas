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
  hosts: hostsFromEnv(env), // EMUNAS_DOMAIN | EMUNAS_WORKERS_SUBDOMAIN (+ EMUNAS_STAGE) | EMUNAS_{QUIET,LIVE}_ORIGIN
  data: { ...pageLookupFromLayer(layerFiles), occasionKind, sectionStart }, // all optional lookups from .corpus/
});
links.live.shiur("en", id, { t: player.currentTime }); // "Open in the listening app"
links.equivalent(url);       // the same page on the other site (Live-only params dropped)
links.canonicalFor(liveUrl); // the Quiet origin, never a fragment; null for threads and no-Quiet-page entries
links.noindexFor(liveUrl);   // true exactly when a Live entry page has no canonical
links.hreflangPair(path);    // yi + en + x-default (site root)
links.withEdition(url, "yi"); // edition switch that keeps the place
```

### Lookups (`LinkData`)

| Lookup | Needed for | Without it |
|---|---|---|
| `hasPage(site, kind, id)` | corpus entry page vs index anchor (Quiet) or no link (Live); canonical/noindex | the page is assumed to exist |
| `conceptTopic(id)` | concept merged into a topic → the topic | the concept's own address |
| `occasionKind(key)` | Live `/o/{key}` → Quiet parsha or zman page | Quiet edition home |
| `sectionStart(id, i)` | Quiet `#s{i}` → Live `?t=` | Live link carries only `m=` |

### Hosts

Production: Quiet on the apex `https://<domain>`, Live on `https://listen.<domain>`. Before the
domain exists (O8) and on staging: `emunas-quiet[-staging].<subdomain>.workers.dev` and
`emunas-live[-staging].<subdomain>.workers.dev`. `isIndexableOrigin()` is false for
workers.dev, localhost and IPs (send `X-Robots-Tag: noindex`). A Quiet origin on `listen.*`
is rejected, so a canonical can never point at Live.

Pages that exist on one site only map to the closest page on the other (Live Explore → the
Quiet topic tree; shelf → Quiet edition home; Quiet contents, years, about → Live UI home; seforim ↔ sources,
maasios ↔ stories). Unknown paths fall back to the edition home, else the root.
