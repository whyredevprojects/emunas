/**
 * Quiet UI strings, English edition. The key union `UiKey` is defined by this table;
 * `yi.ts` must have every key (a missing one fails `tsc`).
 *
 * Wording status: unreviewed (W5.3 does the fixed-copy pass). Plain voice, no
 * "content" vocabulary (concept-quiet §11): shiurim, recordings, notes.
 */
export const en = {
  "site.name": "The Shiurim of the Mashgiach",
  "site.nameShort": "Shiurim",
  "site.description": "The recorded shiurim of Harav Moshe Wolfson zt\"l, arranged as a catalog.",

  "skip.toMain": "Skip to the text",

  "nav.label": "Site",
  "nav.contents": "Contents",
  "nav.calendar": "Calendar",
  "nav.indexes": "Indexes",
  "nav.search": "Search",
  "nav.about": "About",

  "edition.label": "Edition",
  "edition.current": "English edition",
  "edition.other": "ייִדיש",
  "edition.otherName": "Yiddish edition",

  "breadcrumb.label": "You are here",

  "footer.recordingIsSource": "The recordings are the source. Titles are as printed in the 2012 Pocket Guide.",
  "footer.otherEdition": "This page in Yiddish",

  "time.playFrom": "Play from {time}",
  "time.playFromPart": "Play from {time} (part {part})",

  "listen.heading": "Listen",
  "listen.part": "Part {part} of {count}",
  "listen.download": "Download",
  "listen.downloadPart": "Download part {part}",
  "listen.unavailable": "The recording is not yet available online.",
  "listen.unavailablePart": "Part {part}: not yet available online.",
  "listen.noSupport": "This browser cannot play the recording here. Use the download link.",
  "listen.duration": "Length {duration}",

  "citation.label": "Catalog entry",
  "citation.number": "no. {n}",
  "citation.guidePage": "Pocket Guide p. {page}",
  "citation.series": "series",

  "catalog.derived.filename": "Not in the 2012 Pocket Guide; the title is taken from the file name.",
  "catalog.derived.dirPrefix": "Not in the 2012 Pocket Guide; the title is taken from the folder and file name.",

  "notes.label": "Notes",

  "chooser.title": "Choose an edition",
  "chooser.enter": "English edition",
  "chooser.enterNote": "Interface and notes in English. All shiurim, in Yiddish and English.",
} as const;

export type UiKey = keyof typeof en;
