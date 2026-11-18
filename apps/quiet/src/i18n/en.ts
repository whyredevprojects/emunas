/**
 * Quiet UI strings, English edition. The key union `UiKey` is defined by this table;
 * `yi.ts` must have every key (a missing one fails `tsc`).
 *
 * Wording status: unreviewed (W5.3 does the fixed-copy pass). Plain voice, no
 * "content" vocabulary (concept-quiet §11): shiurim, recordings, notes.
 */
export const en = {
  "site.name": "Library — Shiurim",
  "site.nameShort": "Shiurim",
  "site.description": "The recorded shiurim of Harav Moshe Wolfson zt\"l.",

  "skip.toMain": "Skip to the text",

  "nav.label": "Site",
  "nav.contents": "Contents",
  "nav.calendar": "Calendar",
  "nav.indexes": "Indexes",
  "nav.search": "Search",
  "nav.about": "About",

  "edition.label": "Edition",
  "edition.current": "English edition",
  "edition.other": "אידיש",
  "edition.otherName": "Yiddish edition",

  "theme.label": "Colours",
  "theme.light": "Light",
  "theme.dark": "Dark",

  "link.newTab": "(opens in a new tab)",

  "breadcrumb.label": "You are here",

  "footer.recordingIsSource": "The recordings are the source.",
  "footer.otherEdition": "This page in Yiddish",
  "footer.home": "Emunas home",

  "time.playFrom": "Play from {time}",
  "time.playFromPart": "Play from {time} (part {part})",

  "listen.heading": "Listen",
  "listen.part": "Part {part} of {count}",
  "listen.download": "Download",
  "listen.downloadPart": "Download part {part}",
  "listen.unavailable": "The recording is not yet available online.",
  "listen.unavailablePart": "Part {part}: not yet available online.",
  "listen.noSupport": "This browser cannot play the recording here. Use the download link.",

  "citation.label": "Details",
  "citation.number": "no. {n}",
  "citation.perek": "Perek {perek}",

  "notes.label": "Notes",

  "chooser.title": "Choose an edition",
  "chooser.enter": "English edition",
  "chooser.enterNote": "Interface and notes in English. All shiurim, in Yiddish and English.",
} as const;

export type UiKey = keyof typeof en;
