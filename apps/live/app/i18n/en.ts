/**
 * English UI strings for the Live site (integration-plan §1.3: UI strings stay in the app).
 * The key union `UiKey` is taken from this table; `yi.ts` must provide every key (tsc enforces it).
 *
 * Tone (concept-live §7): plain and respectful, no marketing voice, no exclamation marks.
 * Data vocabulary (categories, section kinds, AI-notes labels) comes from `@emunas/i18n`, not here.
 */
export const en = {
  "site.name": "Emunas — Listen",
  "site.short": "Emunas",
  "site.tagline": 'Shiurim of Harav Moshe Wolfson zt"l',

  "shell.skip": "Skip to content",
  "shell.rail": "Main",
  "shell.dock": "Player",
  "shell.dockIdle": "Nothing is playing",

  "nav.today": "Today",
  "nav.explore": "Explore",
  "nav.seforim": "Seforim",
  "nav.maasios": "Maasios",
  "nav.series": "Series",
  "nav.shelf": "My Shelf",
  "nav.search": "Search",

  "lang.button": "Language",
  "lang.dialog": "Language settings",
  "lang.ui": "Interface language",
  "lang.uiSwitch": "אידיש",
  "lang.audio": "Shiurim to hear",
  "lang.audio.both": "Yiddish and English",
  "lang.audio.yi": "Yiddish only",
  "lang.audio.en": "English only",
  "lang.read": "Reading language for notes",
  "lang.read.en": "English",
  "lang.read.yi": "Yiddish",
  "lang.summary": "Interface: {ui}. Audio: {audio}. Notes: {read}.",

  "home.title": "Choose a language",
  "home.redirecting": "Opening the site in your language…",
  "home.en": "English",
  "home.yi": "אידיש",

  "stub.note": "This page is being built.",
  "page.today": "Today",
  "page.today.lead": "This week's parsha and zmanim, what you were listening to, and a moment for today.",
  "page.shiur": "Shiur",
  "page.shiur.lead": "The listening room for shiur {id}.",
  "page.explore": "Explore",
  "page.explore.lead": "Browse all shiurim and moments by occasion, year, sefer, person and idea.",
  "page.seforim": "Seforim",
  "page.seforim.lead": "The seforim the shiurim cite, in their own order.",
  "page.work": "Sefer",
  "page.work.lead": "Where {work} is cited in the shiurim.",
  "page.workChapter": "Sefer, by chapter",
  "page.workChapter.lead": "Citations of {work}, {chapter}.",
  "page.maasios": "Maasios",
  "page.maasios.lead": "Stories told in the shiurim.",
  "page.series": "Series",
  "page.series.lead": "Shiurim given in order, such as Tanya and Emunah.",
  "page.seriesOne": "Series",
  "page.seriesOne.lead": "The parts of series {id}, in order.",
  "page.person": "Person",
  "page.person.lead": "Shiurim and stories about {id}.",
  "page.concept": "Inyan",
  "page.concept.lead": "Where the inyan {id} is discussed.",
  "page.occasion": "Occasion",
  "page.occasion.lead": "Shiurim for {id}.",
  "page.search": "Search",
  "page.search.lead": "Search the shiurim by their notes and catalog titles.",
  "page.searchQuery": "Results for {q}",
  "page.shelf": "My Shelf",
  "page.shelf.lead":
    "What you are listening to, your queue, playlists, saved moments and downloads. Kept on this device only.",
  "page.shelfSection": "My Shelf",
  "page.shelfSection.lead": "Section: {section}.",
  "page.playlist": "Shared playlist",
  "page.playlist.lead": "A list of moments someone shared with you.",
  "page.notFound": "Page not found",
  "page.notFound.lead": "There is no page at this address.",
  "page.notFound.home": "Go to Today",
  "page.error": "Something went wrong",

  "count.shiurim": { one: "{count} shiur", other: "{count} shiurim" },
} as const;

export type UiKey = keyof typeof en;
