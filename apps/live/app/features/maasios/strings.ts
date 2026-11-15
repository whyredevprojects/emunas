/**
 * UI strings for the Maasios library and the story pages (C2.7). Kept with the feature, same
 * `createT` contract as the app's table: `yi` provides every key, placeholders survive translation.
 * Corpus-wide wording (the AI label, "the tellings differ on the attribution", "retold from N
 * tellings") comes from the shared vocabulary in `@emunas/i18n`.
 */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";

export const maasiosEn = {
  "loading": "Loading…",
  "error": "This page could not be loaded. Check your connection and reload.",
  "more": "Show more ({count} left)",
  "lead": "The stories told in the shiurim. A story the Rav told more than once is one entry, with every telling.",
  "facet.people": "Stories about",
  "facet.people.all": "Everyone",
  "facet.people.more": "More people",
  "facet.people.page": "Page of {name}",
  "facet.topic": "Topic",
  "facet.topic.all": "All topics",
  "facet.many": "Told more than once",
  "count": "{shown} of {total} stories",
  "none": "No stories match.",
  "card.told": { one: "told once", other: "told {count} times" },
  "card.play": "Play",
  "card.time.none": "time not known",
  "card.tellings": "All tellings",
  "card.expand": "Where it is told",
  "card.collapse": "Hide",
  "telling.show": "As told in this shiur",
  "telling.hide": "Hide this telling",
  "telling.loading": "Loading this telling…",
  "telling.error": "Could not load this telling.",
  "telling.none": "This shiur has no retelling of its own for this story.",
  "telling.listen": "Open in the shiur",
  "telling.play": "Play this telling",
  "telling.playing": "Playing",
  "telling.year.none": "year not known",
  "story.play": "Play a telling",
  "story.tellings": "The tellings",
  "story.tellings.lead": "Each time it was told, with the section of the shiur it sits in.",
  "only.title": "Stories only",
  "only.lead": "Plays the stories below one after another, one telling each, each from its start to its end.",
  "only.play": { one: "Play {count} story", other: "Play {count} stories" },
  "only.skipped": {
    one: "{count} story you heard in this visit is skipped.",
    other: "{count} stories you heard in this visit are skipped.",
  },
  "only.reset": "Include them again",
  "only.playing": { one: "Playing {count} story in the queue.", other: "Playing {count} stories in the queue." },
  "only.failed": "Could not start playing.",
  "only.replaces": "Replaces your queue.",
} as const satisfies MessageTable<string>;

export type MaasiosKey = keyof typeof maasiosEn;

export const maasiosYi: MessageTable<MaasiosKey> = {
  "loading": "ווערט געלאדנט…",
  "error": "דער בלאט האט נישט געקענט געלאדנט ווערן. קוקט איבער די פארבינדונג און לאדנט נאכאמאל.",
  "more": "ווייזט מער ({count} פארבליבן)",
  "lead": "די מעשיות וואס ווערן דערציילט אין די שיעורים. א מעשה וואס דער משגיח האט דערציילט מער ווי איין מאל איז איין שורה, מיט יעדעס מאל.",
  "facet.people": "מעשיות וועגן",
  "facet.people.all": "אלעמען",
  "facet.people.more": "נאך פערזאנען",
  "facet.people.page": "דער בלאט פון {name}",
  "facet.topic": "ענין",
  "facet.topic.all": "אלע ענינים",
  "facet.many": "דערציילט מער ווי איין מאל",
  "count": "{shown} פון {total} מעשיות",
  "none": "קיין מעשיות פאסן נישט.",
  "card.told": { one: "דערציילט איין מאל", other: "דערציילט {count} מאל" },
  "card.play": "שפילט",
  "card.time.none": "די צייט איז נישט באקאנט",
  "card.tellings": "אלע מאל",
  "card.expand": "וואו עס ווערט דערציילט",
  "card.collapse": "באהאלט",
  "telling.show": "ווי עס ווערט דערציילט אין דעם שיעור",
  "telling.hide": "באהאלט דאס",
  "telling.loading": "ווערט געלאדנט…",
  "telling.error": "דאס האט נישט געקענט געלאדנט ווערן.",
  "telling.none": "דער שיעור האט נישט קיין אייגענע איבערדערציילונג פון דער מעשה.",
  "telling.listen": "עפנט אינעם שיעור",
  "telling.play": "שפילט דאס מאל",
  "telling.playing": "שפילט יעצט",
  "telling.year.none": "דאס יאר איז נישט באקאנט",
  "story.play": "שפילט איין מאל",
  "story.tellings": "די מאל וואס זי ווערט דערציילט",
  "story.tellings.lead": "יעדעס מאל וואס זי ווערט דערציילט, מיטן חלק פונעם שיעור וואו זי שטייט.",
  "only.title": "נאר מעשיות",
  "only.lead": "שפילט די מעשיות אונטן איינע נאך די אנדערע, איין מאל פון יעדער, יעדע פון אנהייב ביזן סוף.",
  "only.play": { one: "שפילט {count} מעשה", other: "שפילט {count} מעשיות" },
  "only.skipped": {
    one: "{count} מעשה וואס איר האט שוין געהערט דאס מאל ווערט איבערגעשפרונגען.",
    other: "{count} מעשיות וואס איר האט שוין געהערט דאס מאל ווערן איבערגעשפרונגען.",
  },
  "only.reset": "נעמט זיי ווידער אריין",
  "only.playing": { one: "שפילט {count} מעשה אין דער ריי.", other: "שפילט {count} מעשיות אין דער ריי." },
  "only.failed": "האט נישט געקענט אנהייבן שפילן.",
  "only.replaces": "דאס בייט אויס אייער ריי.",
};

export type MaasiosT = TFunction<MaasiosKey>;

const cache: Partial<Record<UiLang, MaasiosT>> = {};

export function maasiosT(ui: UiLang): MaasiosT {
  return (cache[ui] ??= createT<MaasiosKey>({ en: maasiosEn, yi: maasiosYi }, ui));
}
