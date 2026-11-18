/**
 * About page strings (W4.6): headings and the report address label only. The About texts themselves
 * are written by a person (concept-quiet §5.11, open question 8; W5.3) and arrive as files under
 * src/content/about/ (see ./_content.ts); nothing here is, or stands in for, that text.
 * Wording status: unreviewed; the Yiddish needs a native reader (W5.3).
 */
import type { Ed } from "../../../lib/edition.ts";

/** The parts of the About page, in order (concept-quiet §5.11). Ids are the in-page anchors. */
export const ABOUT_PARTS = ["mashgiach", "arrangement", "notes", "report", "excluded"] as const;
export type AboutPart = (typeof ABOUT_PARTS)[number];

interface AboutStrings {
  readonly title: string;
  readonly headings: Readonly<Record<AboutPart, string>>;
  /** Label of the report address (a functional link, not prose). */
  readonly reportAddress: string;
  readonly reportPlaceholderAddress: string;
}

export const ABOUT_STRINGS: Readonly<Record<Ed, AboutStrings>> = {
  en: {
    title: "About",
    headings: {
      mashgiach: "The Mashgiach and the collection",
      arrangement: "How this site is arranged",
      notes: "How the notes were made",
      report: "How to report an error",
      excluded: "What is not included",
    },
    reportAddress: "Address for reports:",
    reportPlaceholderAddress: "(placeholder address; the real one is set when the site is published)",
  },
  yi: {
    title: "וועגן",
    headings: {
      mashgiach: "דער משגיח און די זאמלונג",
      arrangement: "ווי דער זייטל איז אויסגעשטעלט",
      notes: "ווי די נאטיצן זענען געמאכט געווארן",
      report: "ווי אזוי צו מעלדן א טעות",
      excluded: "וואס איז נישט אריינגענומען",
    },
    reportAddress: "אדרעס פאר מעלדונגען:",
    reportPlaceholderAddress: "(א צייטווייליגער אדרעס; דער ריכטיגער ווערט באשטימט ווען דער זייטל ווערט ארויסגעגעבן)",
  },
};
