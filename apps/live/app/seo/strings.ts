/**
 * Share-preview and search-result descriptions (W4.5). Built from catalog values and entity names
 * only; never from transcripts (integration-plan §0). Yiddish wording follows the UI tables.
 */
import type { Ed } from "@emunas/corpus/public";
import type { UiLang } from "@emunas/i18n";

export interface SeoStrings {
  shiurim(n: number): string;
  /** A shiur without notes yet: catalog section and years. */
  shiurFallback(lang: Ed, section: string, years: string | null): string;
  series(title: string, count: string): string;
  occasion(title: string, count: string): string;
  work(title: string, count: string): string;
  person(name: string, count: string): string;
  concept(term: string, count: string): string;
  topic(title: string, count: string): string;
  /** A story page: told `tellings` times. */
  story(title: string, tellings: number): string;
  /** A thread page (never the generated summary, E.5). */
  thread(count: string): string;
  /** `og:locale` value. */
  locale: string;
}

const RAV_EN = 'Harav Moshe Wolfson zt"l';
const RAV_YI = 'הרב משה וואלפסאן זצ"ל';

export const seoStrings: Readonly<Record<UiLang, SeoStrings>> = {
  en: {
    shiurim: (n) => (n === 1 ? "1 shiur" : `${n} shiurim`),
    shiurFallback: (lang, section, years) =>
      `A shiur by ${RAV_EN}, in ${lang === "yi" ? "Yiddish" : "English"}. ${section}${years ? `, ${years}` : ""}.`,
    series: (title, count) => `${title}: ${count} in order, from the shiurim of ${RAV_EN}.`,
    occasion: (title, count) => `${title}: ${count} of ${RAV_EN}.`,
    work: (title, count) => `Where ${title} is cited in ${count} of ${RAV_EN}.`,
    person: (name, count) => `${name} in ${count} of ${RAV_EN}: cited, in stories and discussed.`,
    concept: (term, count) => `${term} in ${count} of ${RAV_EN}.`,
    topic: (title, count) => `${title}: ${count} of ${RAV_EN}, grouped by topic by AI.`,
    story: (title, tellings) => `${title}: a story told ${tellings === 1 ? "once" : `${tellings} times`} in the shiurim of ${RAV_EN}.`,
    thread: (count) => `A teaching the Mashgiach returns to, in ${count} of ${RAV_EN}. Grouped by AI.`,
    locale: "en_US",
  },
  yi: {
    shiurim: (n) => (n === 1 ? "1 שיעור" : `${n} שיעורים`),
    shiurFallback: (lang, section, years) =>
      `א שיעור פון ${RAV_YI}, אויף ${lang === "yi" ? "אידיש" : "ענגליש"}. ${section}${years ? `, ${years}` : ""}.`,
    series: (title, count) => `${title}: ${count} על הסדר, פון די שיעורים פון ${RAV_YI}.`,
    occasion: (title, count) => `${title}: ${count} פון ${RAV_YI}.`,
    work: (title, count) => `וואו ${title} ווערט געברענגט אין ${count} פון ${RAV_YI}.`,
    person: (name, count) => `${name} אין ${count} פון ${RAV_YI}.`,
    concept: (term, count) => `${term} אין ${count} פון ${RAV_YI}.`,
    topic: (title, count) => `${title}: ${count} פון ${RAV_YI}, צוזאמענגעשטעלט לויט ענין דורך AI.`,
    story: (title, tellings) => `${title}: א מעשה וואס ווערט דערציילט ${tellings === 1 ? "איין מאל" : `${tellings} מאל`} אין די שיעורים פון ${RAV_YI}.`,
    thread: (count) => `א לימוד וואס דער משגיח קומט צוריק צו אים, אין ${count} פון ${RAV_YI}. צוזאמענגעשטעלט דורך AI.`,
    locale: "yi",
  },
};
