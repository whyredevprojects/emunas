import { createLinks, type CorpusKind, type LinkData, type OccasionKind } from "../src/index.ts";

export const HOSTS = { quiet: "https://emunas.example", live: "https://analyze.emunas.example" } as const;

export const SECTION_STARTS: Record<string, number[]> = {
  "yi-parshas-hashavua-brshys-01": [0, 312, 845, 1290],
  "en-parsha-en-nch-01": [0, 120, 600],
};

export const OCCASIONS: Record<string, OccasionKind> = {
  bereishis: "parsha",
  noach: "parsha",
  "lag-baomer": "zman",
  "shavuos": "zman",
};

/** Quiet page flags of a few entities (as the corpus layer gives them); `false`: no page of its own. */
export const QUIET_PAGES: Partial<Record<CorpusKind, Record<string, boolean>>> = {
  work: { ramban: true, "sfas-emes": true, "rare-sefer": false },
  person: { "dovid-hamelech": true, "baal-shem-tov": true, "once-mentioned": false },
  concept: { emunah: true, "hisbodedus": true, "two-only": false },
};

export const DATA: LinkData = {
  sectionStart: (id, i) => SECTION_STARTS[id]?.[i],
  occasionKind: (k) => OCCASIONS[k],
  hasPage: (site, kind, id) => (site === "quiet" ? QUIET_PAGES[kind]?.[id] : undefined),
};

export const links = createLinks({ hosts: HOSTS, data: DATA });
