/**
 * UI strings of the "Something's wrong here" report (W4.7). Kept with the feature, built with
 * `createT` from `@emunas/i18n`, so a key missing in Yiddish fails `tsc`. Yiddish wording is
 * unreviewed until the Yiddish UI review (W5.3).
 */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";

export const feedbackEn = {
  "report.open": "Something's wrong here",
  "report.title": "Something's wrong here?",
  "report.lead": "Reports go to the person who looks after the notes. They do not change the site.",
  "report.note": "Add a note (optional, before you choose)",
  "report.noteCount": "{n} of {max} characters",
  "report.reasons": "What is wrong?",
  "reason.wrong-source": "Wrong source",
  "reason.wrong-name": "Wrong name",
  "reason.wrong-time": "Wrong time",
  "reason.misrepresents": "Misrepresents the shiur",
  "reason.other": "Something else",
  "report.verifying": "Checking that you are a person…",
  "report.sending": "Sending…",
  "report.sent": "Thank you. Your report was sent.",
  "report.close": "Close",
  "report.retry": "Try again",
  "error.verify": "We could not confirm that this report comes from a person. Please choose again.",
  "error.verifyLoad": "The check that keeps out automated reports did not load. Please try again.",
  "error.rate": "Too many reports from here just now. Please try again in a little while.",
  "error.unavailable": "Reports cannot be sent right now. Please try again later.",
  "error.network": "The report could not be sent. Please check the connection and choose again.",
  "error.invalid": "The report could not be sent. Please shorten the note and choose again.",
} as const;

export type FeedbackKey = keyof typeof feedbackEn;

export const feedbackYi: MessageTable<FeedbackKey> = {
  "report.open": "עפעס איז דא נישט ריכטיג",
  "report.title": "עפעס איז דא נישט ריכטיג?",
  "report.lead": "מעלדונגען גייען צו דעם וואס קוקט נאך די נאטיצן. זיי טוישן נישט דעם זייטל.",
  "report.note": "לייגט צו א הערה (אויב איר ווילט, איידער איר קלייבט)",
  "report.noteCount": "{n} פון {max} אותיות",
  "report.reasons": "וואס איז נישט ריכטיג?",
  "reason.wrong-source": "אומריכטיגער מקור",
  "reason.wrong-name": "אומריכטיגער נאמען",
  "reason.wrong-time": "אומריכטיגע צייט",
  "reason.misrepresents": "גיט נישט אריבער דעם שיעור ריכטיג",
  "reason.other": "עפעס אנדערש",
  "report.verifying": "מ׳קוקט נאך אז איר זענט א מענטש…",
  "report.sending": "מ׳שיקט…",
  "report.sent": "א דאנק. אייער מעלדונג איז געשיקט געווארן.",
  "report.close": "פארמאכן",
  "report.retry": "פרובירט נאכאמאל",
  "error.verify": "מ׳האט נישט געקענט באשטעטיגן אז די מעלדונג קומט פון א מענטש. קלייבט נאכאמאל.",
  "error.verifyLoad": "די פרובע וואס האלט אפ אויטאמאטישע מעלדונגען האט זיך נישט געלאדן. פרובירט נאכאמאל.",
  "error.rate": "צו פיל מעלדונגען אין א קורצער צייט. פרובירט נאכאמאל שפעטער.",
  "error.unavailable": "מ׳קען יעצט נישט שיקן מעלדונגען. פרובירט שפעטער.",
  "error.network": "מ׳האט נישט געקענט שיקן די מעלדונג. קוקט איבער די פארבינדונג און קלייבט נאכאמאל.",
  "error.invalid": "מ׳האט נישט געקענט שיקן די מעלדונג. מאכט קירצער די הערה און קלייבט נאכאמאל.",
};

export type FeedbackT = TFunction<FeedbackKey>;

const cache: Partial<Record<UiLang, FeedbackT>> = {};

export function feedbackT(ui: UiLang): FeedbackT {
  return (cache[ui] ??= createT<FeedbackKey>({ en: feedbackEn, yi: feedbackYi }, ui));
}
