import { createLinks, type EntityKind, type LinkData, type OccasionKind } from "../src/index.ts";

export const HOSTS = { quiet: "https://emunas.example", live: "https://listen.emunas.example" } as const;

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

export const COUNTS: Record<EntityKind, Record<string, number>> = {
  work: { ramban: 40, "sfas-emes": 2, "rare-sefer": 1 },
  person: { "dovid-hamelech": 12, "baal-shem-tov": 2, "once-mentioned": 1 },
  concept: { emunah: 90, "hisbodedus": 3, "two-only": 2 },
};

export const DATA: LinkData = {
  sectionStart: (id, i) => SECTION_STARTS[id]?.[i],
  occasionKind: (k) => OCCASIONS[k],
  entityCount: (e, k) => COUNTS[e][k],
};

export const links = createLinks({ hosts: HOSTS, data: DATA });
