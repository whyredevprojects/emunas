/**
 * UI strings for the offline-download control. Typed like the app's other feature tables
 * (`createT` over the English key union, so a missing Yiddish string fails `tsc`). Yiddish wording is
 * unreviewed until the Yiddish UI review (W5.3).
 */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";

export const offlineEn = {
  "offline.download": "Download for offline",
  "offline.resume": "Finish download",
  "offline.downloading": "Downloading… {percent}%",
  "offline.downloadingUnknown": "Downloading… {mb} MB",
  "offline.cancel": "Cancel download",
  "offline.downloaded": "Downloaded",
  "offline.remove": "Remove download",
  "offline.partial": "Partly downloaded",
  "offline.error.network": "The download stopped. Check the connection and try again.",
  "offline.error.quota": "There is not enough space on this device.",
  "offline.error.unavailable": "This browser cannot keep shiurim for offline listening.",
  "offline.error.aborted": "Download cancelled.",
  "offline.error.unplayable": "This shiur has no recording that can be downloaded.",
} as const;

export type OfflineKey = keyof typeof offlineEn;

export const offlineYi: MessageTable<OfflineKey> = {
  "offline.download": "אראפלאדן צו הערן אן אינטערנעט",
  "offline.resume": "ענדיקן דאס אראפלאדן",
  "offline.downloading": "מען לאדט אראפ… {percent}%",
  "offline.downloadingUnknown": "מען לאדט אראפ… {mb} MB",
  "offline.cancel": "אפשטעלן דאס אראפלאדן",
  "offline.downloaded": "אראפגעלאדן",
  "offline.remove": "אויסמעקן דאס אראפגעלאדענע",
  "offline.partial": "א טייל אראפגעלאדן",
  "offline.error.network": "דאס אראפלאדן האט זיך אפגעשטעלט. קוקט אויף דער פארבינדונג און פרובירט נאכאמאל.",
  "offline.error.quota": "עס איז נישטא גענוג פלאץ אויף דעם מכשיר.",
  "offline.error.unavailable": "דער בלעטערער קען נישט אפהיטן שיעורים צו הערן אן אינטערנעט.",
  "offline.error.aborted": "דאס אראפלאדן איז אפגעשטעלט געווארן.",
  "offline.error.unplayable": "דער שיעור האט נישט קיין רעקארדירונג וואס מען קען אראפלאדן.",
};

const cache: Partial<Record<UiLang, TFunction<OfflineKey>>> = {};

export function offlineT(ui: UiLang): TFunction<OfflineKey> {
  return (cache[ui] ??= createT<OfflineKey>({ en: offlineEn, yi: offlineYi }, ui));
}
