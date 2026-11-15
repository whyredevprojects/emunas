/** UI strings for the series pages (same contract as `features/today/strings.ts`). */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";

export const seriesEn = {
  "series.heading": "Series",
  "series.lead": "Shiurim given as a course, in order. Where a course was given in both languages, the two are separate courses, shown side by side.",
  "series.loading": "Loading…",
  "series.error": "This page could not be loaded. Check your connection and reload.",
  "series.notFound": "There is no series at this address.",
  "series.all": "All series",
  "series.parts": { one: "{count} part", other: "{count} parts" },
  "series.noParts": "No parts of this series are available yet.",
  "series.lang": "In {lang}",
  "series.alsoIn": "Also given in {lang}",
  "series.view": "Show",
  "series.view.order": "In order",
  "series.view.perek": "By perek",
  "series.view.both": "Both languages side by side",
  "series.perek": "Perek {n}",
  "series.perek.intro": "Introduction",
  "series.perek.other": "Other parts",
  "series.part": "Part {n}",
  "series.part.noOrder": "Part",
  "series.progress": "{done} of {total} parts heard",
  "series.progress.none": "Parts you hear are marked here.",
  "series.continue": "Continue with part {n}",
  "series.heard": "Heard",
  "series.started": "Started",
  "series.overviewGap": "Series overviews have not been written yet; the parts are listed with their catalog titles and notes.",
} as const;

export type SeriesKey = keyof typeof seriesEn;

export const seriesYi: MessageTable<SeriesKey> = {
  "series.heading": "סעריעס",
  "series.lead": "שיעורים וואס זענען געזאגט געווארן ווי א קורס, על הסדר. ווען א קורס איז געזאגט געווארן אין ביידע שפראכן, זענען דאס צוויי באזונדערע קורסן, געוויזן איינס לעבן דעם אנדערן.",
  "series.loading": "לאדנט…",
  "series.error": "מען האט נישט געקענט לאדן דעם בלאט. קוקט איבער די פארבינדונג און לאדנט איבער.",
  "series.notFound": "ס׳איז נישטא קיין סעריע אויף דעם אדרעס.",
  "series.all": "אלע סעריעס",
  "series.parts": { one: "{count} חלק", other: "{count} חלקים" },
  "series.noParts": "קיין חלקים פון דער סעריע זענען נאך נישט פאראן.",
  "series.lang": "אויף {lang}",
  "series.alsoIn": "אויך געזאגט אויף {lang}",
  "series.view": "ווייזן",
  "series.view.order": "על הסדר",
  "series.view.perek": "לויט פרק",
  "series.view.both": "ביידע שפראכן לעבן אנאנד",
  "series.perek": "פרק {n}",
  "series.perek.intro": "הקדמה",
  "series.perek.other": "אנדערע חלקים",
  "series.part": "חלק {n}",
  "series.part.noOrder": "חלק",
  "series.progress": "{done} פון {total} חלקים געהערט",
  "series.progress.none": "חלקים וואס איר הערט וועלן דא אנגעצייכנט ווערן.",
  "series.continue": "ווייטער מיט חלק {n}",
  "series.heard": "געהערט",
  "series.started": "אנגעהויבן",
  "series.overviewGap": "איבערבליקן פון די סעריעס זענען נאך נישט געשריבן; די חלקים ווערן געוויזן מיט זייערע קאטאלאג טיטלען און נאטיצן.",
};

export type SeriesT = TFunction<SeriesKey>;

const cache: Partial<Record<UiLang, SeriesT>> = {};

export function seriesT(ui: UiLang): SeriesT {
  return (cache[ui] ??= createT<SeriesKey>({ en: seriesEn, yi: seriesYi }, ui));
}
