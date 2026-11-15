/**
 * UI strings for My Shelf and the shared playlist page. Kept with the feature (the app-wide tables in
 * `app/i18n` belong to the shell) and typed the same way: `createT` over an English key union, so a
 * missing Yiddish string fails `tsc`. Yiddish wording is unreviewed until the Yiddish UI review (W5.3).
 */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";
import { useUi } from "../../i18n/index.ts";

export const shelfEn = {
  "shelf.title": "My Shelf",
  "shelf.lead": "What you are listening to, your queue, playlists, saved moments and notes. Kept on this device only.",
  "shelf.loading": "Opening your shelf…",
  "shelf.memoryNotice":
    "This browser is not letting the site keep data, so your shelf lasts only until this tab is closed. Export it below to keep a copy.",
  "shelf.back": "My Shelf",
  "shelf.seeAll": { one: "See all ({count})", other: "See all ({count})" },
  "shelf.unknownSection": "There is no such part of My Shelf.",

  "section.continue": "Continue listening",
  "section.queue": "Queue",
  "section.playlists": "Playlists",
  "section.saved": "Saved moments",
  "section.notes": "Notes",
  "section.history": "History",
  "section.downloads": "Downloads",

  "empty.continue": "Nothing in progress. Shiurim you start listening to appear here.",
  "empty.queue": "The queue is empty. Add a shiur or any moment of one with “Add to queue”.",
  "empty.playlists": "No playlists yet. Save the queue as a playlist, or save a playlist someone shared with you.",
  "empty.saved": "No saved moments yet.",
  "empty.notes": "No notes yet. In the listening room you can add a private note at the current time.",
  "empty.history": "Nothing listened to yet.",
  "empty.downloads": "Nothing downloaded for offline listening.",

  "item.from": "from {start}",
  "item.range": "{start}–{end}",
  "item.at": "at {t}",
  "item.progress": "{t} of {duration}",
  "item.chapters": { one: "{count} chapter finished", other: "{count} chapters finished" },
  "item.count": { one: "{count} item", other: "{count} items" },
  "item.open": "Open in the listening room",
  "item.size": "{mb} MB",
  "item.partial": "partly downloaded",

  "action.play": "Play",
  "action.playAll": "Play all",
  "action.resume": "Resume",
  "action.addToQueue": "Add to queue",
  "action.remove": "Remove",
  "action.moveUp": "Move up",
  "action.moveDown": "Move down",
  "action.next": "Next",
  "action.prev": "Previous",
  "action.clearQueue": "Clear the queue",
  "action.saveAsPlaylist": "Save as playlist",
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.share": "Share link",
  "action.rename": "Rename",
  "action.delete": "Delete",
  "action.edit": "Edit",
  "action.clearHistory": "Clear history",
  "action.open": "Open",

  "queue.nowPlaying": "Now playing",
  "queue.failed": "Unavailable, skipped",
  "queue.finished": "The queue has finished.",
  "queue.label": "Item {n}",

  "playlist.name": "Playlist name",
  "playlist.defaultName": "Playlist {date}",
  "playlist.linkLabel": "Link to this list",
  "playlist.copied": "Link copied.",
  "playlist.deleteConfirm": "Delete the playlist “{name}”?",
  "playlist.notFound": "This playlist is not on this device.",

  "note.label": "Note",

  "transfer.title": "Keep a copy",
  "transfer.lead":
    "Your shelf is stored on this device only. Export it to a file to keep a copy or to move it to another device, then import it there.",
  "transfer.export": "Export to a file",
  "transfer.import": "Import from a file",
  "transfer.mode": "When importing",
  "transfer.merge": "Merge with what is here (newer wins)",
  "transfer.replace": "Replace what is here",
  "transfer.done": { one: "Imported {count} item.", other: "Imported {count} items." },
  "transfer.skipped": {
    one: "{count} entry could not be read and was skipped.",
    other: "{count} entries could not be read and were skipped.",
  },
  "transfer.error.not-json": "That file is not a My Shelf export.",
  "transfer.error.wrong-format": "That file is not a My Shelf export.",
  "transfer.error.too-large": "That file is too large to be a My Shelf export.",
  "transfer.error.newer-version": "That file was made by a newer version of this site. Reload the page and try again.",
  "transfer.error.read": "The file could not be read.",
  "transfer.erase": "Erase my shelf on this device",
  "transfer.eraseConfirm": "Erase everything on My Shelf on this device? This cannot be undone.",

  "pl.title": "Shared playlist",
  "pl.lead": "A list of moments someone shared with you. Nothing is kept until you save it.",
  "pl.invalid": "This link does not hold a playlist. It may have been cut off when it was copied.",
  "pl.saved": "Saved to your playlists.",
  "pl.sharedName": "Shared playlist",
} as const;

export type ShelfKey = keyof typeof shelfEn;

export const shelfYi: MessageTable<ShelfKey> = {
  "shelf.title": "מיין פאליצע",
  "shelf.lead": "וואס איר הערט, אייער ריי, ליסטעס, אפגעהיטענע נקודות און הערות. נאר אויף דעם מכשיר.",
  "shelf.loading": "מען עפנט אייער פאליצע…",
  "shelf.memoryNotice":
    "דער בראוזער לאזט נישט דעם זייטל אפהיטן קיין דאטא, ממילא בלייבט אייער פאליצע נאר ביז מען מאכט צו דעם טאב. עקספארטירט עס אונטן כדי צו האלטן א קאפיע.",
  "shelf.back": "מיין פאליצע",
  "shelf.seeAll": { one: "אלע ({count})", other: "אלע ({count})" },
  "shelf.unknownSection": "אזא טייל איז נישטא אויף מיין פאליצע.",

  "section.continue": "הערט ווייטער",
  "section.queue": "ריי",
  "section.playlists": "ליסטעס",
  "section.saved": "אפגעהיטענע נקודות",
  "section.notes": "הערות",
  "section.history": "היסטאריע",
  "section.downloads": "אראפגעלאדענע",

  "empty.continue": "גארנישט אנגעהויבן. שיעורים וואס איר הייבט אן הערן ווייזן זיך דא.",
  "empty.queue": "די ריי איז ליידיג. לייגט צו א שיעור אדער א נקודה דערפון מיט „צולייגן צו דער ריי“.",
  "empty.playlists": "נאך קיין ליסטעס. היט אפ די ריי ווי א ליסטע, אדער היט אפ א ליסטע וואס מען האט אייך צוגעשיקט.",
  "empty.saved": "נאך קיין אפגעהיטענע נקודות.",
  "empty.notes": "נאך קיין הערות. ביים הערן קען מען צולייגן א פריוואטע הערה ביי דער יעצטיגער צייט.",
  "empty.history": "נאך גארנישט געהערט.",
  "empty.downloads": "גארנישט אראפגעלאדן צו הערן אן אינטערנעט.",

  "item.from": "פון {start}",
  "item.range": "{start}–{end}",
  "item.at": "ביי {t}",
  "item.progress": "{t} פון {duration}",
  "item.chapters": { one: "{count} חלק פארענדיגט", other: "{count} חלקים פארענדיגט" },
  "item.count": { one: "{count} זאך", other: "{count} זאכן" },
  "item.open": "עפנט צום הערן",
  "item.size": "{mb} MB",
  "item.partial": "א טייל אראפגעלאדן",

  "action.play": "שפילן",
  "action.playAll": "שפילן אלעס",
  "action.resume": "ווייטער הערן",
  "action.addToQueue": "צולייגן צו דער ריי",
  "action.remove": "אראפנעמען",
  "action.moveUp": "פריער",
  "action.moveDown": "שפעטער",
  "action.next": "ווייטער",
  "action.prev": "צוריק",
  "action.clearQueue": "ליידיגן די ריי",
  "action.saveAsPlaylist": "אפהיטן ווי א ליסטע",
  "action.save": "אפהיטן",
  "action.cancel": "בטל",
  "action.share": "לינק צו שיקן",
  "action.rename": "בייטן נאמען",
  "action.delete": "אויסמעקן",
  "action.edit": "רעדאקטירן",
  "action.clearHistory": "אויסמעקן היסטאריע",
  "action.open": "עפענען",

  "queue.nowPlaying": "שפילט יעצט",
  "queue.failed": "נישט דא, איבערגעשפרונגען",
  "queue.finished": "די ריי איז פארענדיגט.",
  "queue.label": "נומער {n}",

  "playlist.name": "נאמען פון דער ליסטע",
  "playlist.defaultName": "ליסטע {date}",
  "playlist.linkLabel": "לינק צו דער ליסטע",
  "playlist.copied": "דער לינק איז קאפירט.",
  "playlist.deleteConfirm": "אויסמעקן די ליסטע „{name}“?",
  "playlist.notFound": "די ליסטע איז נישטא אויף דעם מכשיר.",

  "note.label": "הערה",

  "transfer.title": "האלטן א קאפיע",
  "transfer.lead":
    "אייער פאליצע ליגט נאר אויף דעם מכשיר. עקספארטירט עס צו א פייל כדי צו האלטן א קאפיע אדער אריבערפירן צו אן אנדער מכשיר, און אימפארטירט עס דארט.",
  "transfer.export": "עקספארטירן צו א פייל",
  "transfer.import": "אימפארטירן פון א פייל",
  "transfer.mode": "ביים אימפארטירן",
  "transfer.merge": "צוזאמענמישן מיט וואס איז דא (דאס נייערע געווינט)",
  "transfer.replace": "פארבייטן וואס איז דא",
  "transfer.done": { one: "אימפארטירט {count} זאך.", other: "אימפארטירט {count} זאכן." },
  "transfer.skipped": { one: "{count} זאך האט מען נישט געקענט לייענען און איבערגעשפרונגען.", other: "{count} זאכן האט מען נישט געקענט לייענען און איבערגעשפרונגען." },
  "transfer.error.not-json": "דער פייל איז נישט קיין עקספארט פון מיין פאליצע.",
  "transfer.error.wrong-format": "דער פייל איז נישט קיין עקספארט פון מיין פאליצע.",
  "transfer.error.too-large": "דער פייל איז צו גרויס פאר אן עקספארט פון מיין פאליצע.",
  "transfer.error.newer-version": "דער פייל איז געמאכט געווארן פון א נייערער ווערסיע פונעם זייטל. לאדט איבער דעם בלאט און פרובירט נאכאמאל.",
  "transfer.error.read": "מען האט נישט געקענט לייענען דעם פייל.",
  "transfer.erase": "אויסמעקן מיין פאליצע אויף דעם מכשיר",
  "transfer.eraseConfirm": "אויסמעקן אלעס אויף מיין פאליצע אויף דעם מכשיר? מען קען עס נישט צוריקברענגען.",

  "pl.title": "א צוגעשיקטע ליסטע",
  "pl.lead": "א ליסטע פון נקודות וואס איינער האט אייך צוגעשיקט. מען היט גארנישט אפ ביז איר היט עס אפ.",
  "pl.invalid": "דער לינק האט נישט קיין ליסטע. אפשר איז ער אפגעשניטן געווארן ביים קאפירן.",
  "pl.saved": "אפגעהיט צווישן אייערע ליסטעס.",
  "pl.sharedName": "א צוגעשיקטע ליסטע",
};

export type ShelfT = TFunction<ShelfKey>;

const cache: Partial<Record<UiLang, ShelfT>> = {};

export function shelfT(ui: UiLang): ShelfT {
  return (cache[ui] ??= createT<ShelfKey>({ en: shelfEn, yi: shelfYi }, ui));
}

export function useShelfT(): ShelfT {
  return shelfT(useUi());
}
