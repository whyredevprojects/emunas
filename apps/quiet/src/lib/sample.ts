/**
 * Synthetic data for the design-shell sample page (`/{ed}/shell-sample/`, built only with
 * `EMUNAS_SHELL_SAMPLE=1`) and for component tests. Shapes follow `@emunas/corpus/public`; every
 * string is written here by hand (no transcript, no derived data). The catalog title mixes scripts
 * on purpose, as real titles do (concept-quiet §8).
 */
import type { AudioRecording } from "./audio.ts";
import type { CatalogHeaderShiur } from "./catalog.ts";

export const SAMPLE_MEDIA_ORIGIN = "https://media.example.org";

export const sampleRecordings: readonly AudioRecording[] = [
  { id: "sample-part-1", offset: 0, duration: 1830.5, audioUrl: `${SAMPLE_MEDIA_ORIGIN}/Sample%20Folder/Part%201.mp3` },
  { id: "sample-part-2", offset: 1830.5, duration: 1500, audioUrl: `${SAMPLE_MEDIA_ORIGIN}/Sample%20Folder/Part%202.mp3` },
  { id: "sample-part-3", offset: 3330.5, duration: 600, audioUrl: null },
];

export const sampleShiur: CatalogHeaderShiur = {
  id: "en-sample-shell-01",
  lang: "en",
  catalog: {
    source: "pocket-guide-2012",
    sectionId: "en-parsha",
    sectionTitle: "English Parsha",
    n: "5",
    page: 3,
    titleOriginal: "The קדושה of צדיקים and the חשיבות of Learning תורה",
    subTitle: null,
    derived: "catalog",
    note: null,
    topics: ["The קדושה of צדיקים", "the חשיבות of Learning תורה"],
  },
  parsha: { raw: "נח", key: "noach" },
  zman: null,
  perek: null,
  years: [5743],
  duration: 3930.5,
  pathNotes: [],
};

export const sampleUncatalogued: CatalogHeaderShiur = {
  id: "yi-sample-shell-02",
  lang: "yi",
  catalog: {
    source: "uncatalogued-guide",
    sectionId: "parshas-hashavua",
    sectionTitle: "פרשת השבוע",
    n: null,
    page: null,
    titleOriginal: "Vayeshev",
    subTitle: null,
    derived: "dir-prefix",
    note: null,
    topics: [],
  },
  parsha: { raw: "וישב", key: "vayeshev" },
  zman: null,
  perek: null,
  years: [],
  duration: 2712,
  pathNotes: ["for children (per file name)"],
};

/** Hand-written sample notes, in reported speech, one per edition. */
export const sampleNotes = {
  en: {
    oneLiner: "Sample text: the Rav explains how a place of learning carries its own holiness.",
    outline: [
      { t: 0, title: "Opening" },
      { t: 754, title: "The question from the parsha" },
      { t: 2100, title: "The answer, in the second part" },
    ],
  },
  yi: {
    oneLiner: "א מוסטער: דער משגיח דערקלערט ווי א מקום תורה האט א קדושה פאר זיך.",
    outline: [
      { t: 0, title: "הקדמה" },
      { t: 754, title: "די קשיא פון דער פרשה" },
      { t: 2100, title: "דער תירוץ, אינעם צווייטן טייל" },
    ],
  },
} as const;
