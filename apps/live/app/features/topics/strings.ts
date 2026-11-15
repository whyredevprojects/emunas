/**
 * UI strings for topic pages (concept-live-corpus C.2). Shared corpus wording (the AI label, grade
 * names, "Topics") comes from `@emunas/i18n`'s corpus vocabulary. The Yiddish wording is unreviewed
 * (W5.3).
 */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";

export const topicsEn = {
  "topic.loading": "Loading…",
  "topic.error": "This topic could not be loaded. Check your connection and reload.",
  "topic.count": { one: "{count} shiur", other: "{count} shiurim" },
  "topic.term": "The term",
  "topic.person": "Person page: {name}",
  "topic.work": "Sefer page: {name}",
  "topic.startHere": "Start here",
  "topic.threads": "Threads in this topic",
  "topic.threads.count": { one: "in {count} shiur", other: "in {count} shiurim" },
  "topic.threads.more": { one: "and {count} more", other: "and {count} more" },
  "topic.stories": "Stories told here",
  "topic.stories.told": { one: "told once", other: "told {count} times" },
  "topic.stories.more": { one: "and {count} more", other: "and {count} more" },
  "topic.shiurim": "All shiurim",
  "topic.shiurim.lead": "By how central the topic is to the shiur, then by year.",
  "topic.touched": "Touched on in",
  "topic.touched.at": "at {time}: ",
  "topic.touched.more": { one: "and {count} more section", other: "and {count} more sections" },
  "topic.shiurim.more": "Show more shiurim",
  "topic.shiurim.loading": "Loading more…",
  "topic.shiurim.error": "More shiurim could not be loaded.",
  "topic.undated": "undated",
  "topic.children": "Sub-topics",
  "topic.coTopics": "Often together with",
  "topic.coTopics.sections": { one: "{count} section", other: "{count} sections" },
};

export type TopicsKey = keyof typeof topicsEn;

export const topicsYi: MessageTable<TopicsKey> = {
  "topic.loading": "מ'לאדט…",
  "topic.error": "דער ענין האט זיך נישט געלאדן. קוקט אויף דער פארבינדונג און לאדט איבער.",
  "topic.count": { one: "{count} שיעור", other: "{count} שיעורים" },
  "topic.term": "דער ערך",
  "topic.person": "דער בלאט פון {name}",
  "topic.work": "דער בלאט פונעם ספר {name}",
  "topic.startHere": "הייבט אן דא",
  "topic.threads": "לימודים אין דעם ענין",
  "topic.threads.count": { one: "אין {count} שיעור", other: "אין {count} שיעורים" },
  "topic.threads.more": { one: "און נאך {count}", other: "און נאך {count}" },
  "topic.stories": "מעשיות וואס ווערן דא דערציילט",
  "topic.stories.told": { one: "דערציילט איינמאל", other: "דערציילט {count} מאל" },
  "topic.stories.more": { one: "און נאך {count}", other: "און נאך {count}" },
  "topic.shiurim": "אלע שיעורים",
  "topic.shiurim.lead": "לויט ווי שטארק דער שיעור איז וועגן דעם ענין, און דערנאך לויטן יאר.",
  "topic.touched": "דערמאנט אין",
  "topic.touched.at": "ביי {time}: ",
  "topic.touched.more": { one: "און נאך {count} חלק", other: "און נאך {count} חלקים" },
  "topic.shiurim.more": "ווייזט נאך שיעורים",
  "topic.shiurim.loading": "מ'לאדט נאך…",
  "topic.shiurim.error": "מ'האט נישט געקענט לאדן נאך שיעורים.",
  "topic.undated": "אן א יאר",
  "topic.children": "אונטער-ענינים",
  "topic.coTopics": "אפט צוזאמען מיט",
  "topic.coTopics.sections": { one: "{count} חלק", other: "{count} חלקים" },
};

export type TopicsT = TFunction<TopicsKey>;

const cache: Partial<Record<UiLang, TopicsT>> = {};

export function topicsT(ui: UiLang): TopicsT {
  return (cache[ui] ??= createT<TopicsKey>({ en: topicsEn, yi: topicsYi }, ui));
}
