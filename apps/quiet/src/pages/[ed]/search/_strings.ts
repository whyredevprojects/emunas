/**
 * Search page strings (W3.5). Kept next to the page because the shared UI tables
 * (`src/i18n/*`) belong to the design shell; W5.3 may move them there in the copy pass.
 * Wording status: unreviewed; the Yiddish needs a native reader.
 */
import type { Ed } from "../../../lib/edition.ts";

export const SEARCH_STRINGS = {
  en: {
    title: "Search",
    lede: "Search the catalog and the notes: titles, parsha and zman, years, summaries, sources, people and stories. Hebrew, Yiddish and English all work in both editions.",
    noscript: "Search needs JavaScript. The indexes below are the way to look things up without it.",
    label: "Search the shiurim",
    submit: "Search",
    resultsLabel: "Results",
    searching: "Searching…",
    none: "No shiurim found. Try another spelling, or use the indexes below.",
    one: "1 shiur",
    count: "{n} shiurim",
    error: "Search could not be loaded. The indexes below still work.",
    number: "no. {n}",
    pending: "Notes not yet written.",
    note: "Search covers the catalog and the notes. It does not search the recordings themselves.",
    indexesHeading: "Indexes",
    contents: "Contents (by catalog section)",
    parsha: "By parsha",
    zman: "By zman",
    years: "By year",
    sources: "Sources",
    stories: "Stories",
    people: "People",
    inyanim: "Inyanim (concepts)",
  },
  yi: {
    title: "זוכן",
    lede: "זוכט אינעם קאטאלאג און אין די נאטיצן: קעפּלעך, פּרשה און זמן, יארן, תמצית, מראי מקומות, מענטשן און מעשיות. לשון קודש, אידיש און ענגליש ארבעטן אין ביידע אויסגאבעס.",
    noscript: "צום זוכן דארף מען דזשאוואסקריפּט. אן דעם קען מען נוצן די מפתחות אונטן.",
    label: "זוכט די שיעורים",
    submit: "זוכן",
    resultsLabel: "רעזולטאטן",
    searching: "מען זוכט…",
    none: "קיין שיעורים נישט געפונען. פּרובירט אן אנדער אויסלייג, אדער נוצט די מפתחות אונטן.",
    one: "1 שיעור",
    count: "{n} שיעורים",
    error: "מען האט נישט געקענט אראפּלאדן דאס זוכן. די מפתחות אונטן ארבעטן נאך אלץ.",
    number: "נומ׳ {n}",
    pending: "נאטיצן זענען נאך נישט געשריבן.",
    note: "מען זוכט אינעם קאטאלאג און אין די נאטיצן, נישט אין די רעקארדירונגען אליין.",
    indexesHeading: "מפתחות",
    contents: "תוכן (לויט די אפּטיילונגען פונעם קאטאלאג)",
    parsha: "לויט פּרשה",
    zman: "לויט זמן",
    years: "לויט יאר",
    sources: "מראי מקומות",
    stories: "מעשיות",
    people: "מענטשן",
    inyanim: "ענינים",
  },
} as const satisfies Record<Ed, Record<string, string>>;

export type SearchStringKey = keyof (typeof SEARCH_STRINGS)["en"];

/** Both editions have every key (a missing Yiddish string fails `tsc`). */
export const _complete: Record<Ed, Record<SearchStringKey, string>> = SEARCH_STRINGS;
