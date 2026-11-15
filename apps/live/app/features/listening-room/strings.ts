/**
 * UI strings of the listening room and the player dock (W3.7). Kept with the feature rather than in
 * `app/i18n/` (owned by the shell) and built with the same `createT` from `@emunas/i18n`, so a key
 * missing in Yiddish fails `tsc`. Yiddish wording is unreviewed until W5.3.
 *
 * Data vocabulary (section kinds, resolution wording, the AI label) comes from `@emunas/i18n`.
 */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";

export const roomEn = {
  "room.loading": "Loading the shiur",
  "room.notFound": "This shiur was not found",
  "room.notFound.lead": "The link may be out of date.",
  "room.error": "The shiur could not be loaded",
  "room.error.lead": "Please check the connection and try again.",
  "room.retry": "Try again",

  "room.play": "Play",
  "room.playShiur": "Play this shiur",
  "room.pause": "Pause",
  "room.playFrom": "Play from {time}",
  "room.unavailable": "The recording of this shiur cannot be played here.",
  "room.unavailablePart": "Part {n} of this recording cannot be played here.",
  "room.printable": "Printable page",
  "room.years": "Year",
  "room.duration": "Length",
  "room.audioLang": "Audio",
  "room.seriesPart": "{series}, part {n} of {count}",
  "room.seriesPartNoOrder": "{series}",
  "room.perek": "perek {perek}",
  "room.occasion": "Occasion",
  "room.catalogTopics": "Topics listed in the catalog",
  "room.topicGo": "Go to this topic in the audio",

  "room.chapters": "Chapters",
  "room.chapterSkipped": "skipped while listening",
  "room.storyMarker": "Story",
  "room.moreAbout": "More",
  "room.outline": "Outline from the catalog",
  "room.outline.note": "Not yet timed: the notes for this shiur are being prepared.",

  "room.tabs": "About this shiur",
  "tab.read": "Read",
  "tab.sources": "Sources",
  "tab.insights": "Insights",
  "tab.questions": "Questions",
  "tab.stories": "Stories",
  "tab.related": "Related",

  "read.readingIn": "Reading in",
  "read.loading": "Loading the write-up",
  "read.missing": "The write-up in this language is not available.",
  "read.sources": "Sources in this paragraph",

  "sources.quoted": "quoted",
  "sources.paraphrased": "paraphrased",
  "sources.alluded": "alluded to",
  "sources.onSefaria": "Open on Sefaria",
  "sources.notLocated": "{work}, not located",
  "sources.unnamed": "A source, not located",
  "sources.newTab": "(opens in a new tab)",

  "insights.keyPoints": "Key points",
  "insights.insights": "Insights",
  "insights.takeaways": "Takeaways",

  "questions.hearQuestion": "Hear the question",
  "questions.hearAnswer": "Hear the answer",
  "questions.answer": "Answer",

  "stories.people": "People",
  "stories.retelling": "Read the story",
  "stories.play": "Hear the story",

  "related.sameOccasion": "Other years of this occasion",
  "related.series": "In this series",
  "related.prev": "Previous",
  "related.next": "Next",
  "related.neighbors": "Same idea elsewhere",
  "related.neighbors.note": "Suggested by similarity of the notes; may be loose.",
  "related.otherLanguage": "A separate course on this subject in the other language",
  "related.none": "Nothing related is listed yet.",
  "related.loading": "Loading",

  "moment.focused": "The moment this link points to",
  "time.at": "at {time}",

  "dock.label": "Player",
  "dock.open": "Open the listening room",
  "dock.seek": "Position",
  "dock.position": "{now} of {total}",
  "dock.positionChapter": "{now} of {total}, chapter {n}: {title}",
  "dock.play": "Play",
  "dock.pause": "Pause",
  "dock.back": "Back 15 seconds",
  "dock.forward": "Forward 15 seconds",
  "dock.prevChapter": "Previous chapter",
  "dock.nextChapter": "Next chapter",
  "dock.speed": "Speed",
  "dock.sleep": "Sleep timer",
  "dock.sleep.off": "Off",
  "dock.sleep.minutes": "In {n} minutes",
  "dock.sleep.chapter": "End of chapter",
  "dock.sleep.shiur": "End of shiur",
  "dock.sleep.running": "Timer running",
  "dock.skipped": "Skipped {time} of {kind}",
  "dock.undo": "Undo",
  "dock.momentEnded": "The moment has ended.",
  "dock.keepListening": "Keep listening",
  "dock.loading": "Loading",
  "dock.unavailable": "This recording cannot be played here.",
  "dock.error": "The recording could not be played.",
  "dock.chapterNow": "Now: {title}",
} as const;

export type RoomKey = keyof typeof roomEn;

export const roomYi: MessageTable<RoomKey> = {
  "room.loading": "מ׳לאדט דעם שיעור",
  "room.notFound": "דער שיעור איז נישט געפונען געווארן",
  "room.notFound.lead": "דער לינק איז אפשר שוין אלט.",
  "room.error": "מ׳האט נישט געקענט לאדן דעם שיעור",
  "room.error.lead": "קוקט איבער די פארבינדונג און פרובירט נאכאמאל.",
  "room.retry": "פרובירט נאכאמאל",

  "room.play": "שפילן",
  "room.playShiur": "שפילן דעם שיעור",
  "room.pause": "אפשטעלן",
  "room.playFrom": "שפילן פון {time}",
  "room.unavailable": "די רעקארדירונג פון דעם שיעור קען מען דא נישט שפילן.",
  "room.unavailablePart": "טייל {n} פון דער רעקארדירונג קען מען דא נישט שפילן.",
  "room.printable": "זייטל צום דרוקן",
  "room.years": "יאר",
  "room.duration": "לענג",
  "room.audioLang": "שיעור",
  "room.seriesPart": "{series}, טייל {n} פון {count}",
  "room.seriesPartNoOrder": "{series}",
  "room.perek": "פרק {perek}",
  "room.occasion": "פרשה / זמן",
  "room.catalogTopics": "ענינים וואס שטייען אינעם קאטאלאג",
  "room.topicGo": "גייט צו דעם ענין אינעם שיעור",

  "room.chapters": "חלקים",
  "room.chapterSkipped": "ווערט איבערגעשפרונגען",
  "room.storyMarker": "מעשה",
  "room.moreAbout": "מער",
  "room.outline": "דער תוכן לויטן קאטאלאג",
  "room.outline.note": "נאך נישט צוגעפאסט צו די צייטן: די נאטיצן פאר דעם שיעור ווערן צוגעגרייט.",

  "room.tabs": "וועגן דעם שיעור",
  "tab.read": "לייענען",
  "tab.sources": "מקורות",
  "tab.insights": "געדאנקען",
  "tab.questions": "קושיות",
  "tab.stories": "מעשיות",
  "tab.related": "ענליכע",

  "read.readingIn": "לייענען אויף",
  "read.loading": "מ׳לאדט דעם אויסשרייב",
  "read.missing": "דער אויסשרייב אויף דער שפראך איז נישט דא.",
  "read.sources": "מראי מקומות אין דעם פאראגראף",

  "sources.quoted": "ציטירט",
  "sources.paraphrased": "מיט אנדערע ווערטער",
  "sources.alluded": "אנגעוויזן",
  "sources.onSefaria": "עפענען אויף ספריא",
  "sources.notLocated": "{work}, מקום נישט באשטימט",
  "sources.unnamed": "א מקור, מקום נישט באשטימט",
  "sources.newTab": "(עפנט זיך אין א נייעם טאב)",

  "insights.keyPoints": "עיקרי הדברים",
  "insights.insights": "געדאנקען",
  "insights.takeaways": "וואס מ׳זאל ארויסנעמען",

  "questions.hearQuestion": "הערט די קשיא",
  "questions.hearAnswer": "הערט דעם תירוץ",
  "questions.answer": "תירוץ",

  "stories.people": "פערזאנען",
  "stories.retelling": "לייענט די מעשה",
  "stories.play": "הערט די מעשה",

  "related.sameOccasion": "די זעלבע פרשה אדער זמן, אנדערע יארן",
  "related.series": "אין דער סדרה",
  "related.prev": "פריערדיגער",
  "related.next": "קומענדיגער",
  "related.neighbors": "דער זעלבער געדאנק אנדערש וואו",
  "related.neighbors.note": "פארגעשלאגן לויט ענליכקייט פון די נאטיצן; קען זיין ווייט.",
  "related.otherLanguage": "א באזונדערע סדרה אויף דער אנדערער שפראך",
  "related.none": "נאך גארנישט ענליכס.",
  "related.loading": "מ׳לאדט",

  "moment.focused": "דער מאמענט וואס דער לינק ווייזט",
  "time.at": "ביי {time}",

  "dock.label": "שפילער",
  "dock.open": "עפנט דעם שיעור",
  "dock.seek": "ארט אינעם שיעור",
  "dock.position": "{now} פון {total}",
  "dock.positionChapter": "{now} פון {total}, חלק {n}: {title}",
  "dock.play": "שפילן",
  "dock.pause": "אפשטעלן",
  "dock.back": "15 סעקונדעס צוריק",
  "dock.forward": "15 סעקונדעס פאראויס",
  "dock.prevChapter": "פריערדיגער חלק",
  "dock.nextChapter": "קומענדיגער חלק",
  "dock.speed": "גיכקייט",
  "dock.sleep": "שלאף צייטער",
  "dock.sleep.off": "אויסגעלאשן",
  "dock.sleep.minutes": "אין {n} מינוט",
  "dock.sleep.chapter": "סוף פונעם חלק",
  "dock.sleep.shiur": "סוף פונעם שיעור",
  "dock.sleep.running": "דער צייטער לויפט",
  "dock.skipped": "איבערגעשפרונגען {time} {kind}",
  "dock.undo": "צוריק",
  "dock.momentEnded": "דער מאמענט האט זיך געענדיגט.",
  "dock.keepListening": "הערט ווייטער",
  "dock.loading": "מ׳לאדט",
  "dock.unavailable": "די רעקארדירונג קען מען דא נישט שפילן.",
  "dock.error": "מ׳האט נישט געקענט שפילן די רעקארדירונג.",
  "dock.chapterNow": "יעצט: {title}",
};

export type RoomT = TFunction<RoomKey>;

const cache: Partial<Record<UiLang, RoomT>> = {};

export function roomT(ui: UiLang): RoomT {
  return (cache[ui] ??= createT<RoomKey>({ en: roomEn, yi: roomYi }, ui));
}
