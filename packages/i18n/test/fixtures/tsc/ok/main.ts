import { createT, type MessageTable } from "../../../../src/index.ts";

const en = { "nav.home": "Home", "nav.search": "Search" } as const;
type UiKey = keyof typeof en;
const yi: MessageTable<UiKey> = { "nav.home": "היים", "nav.search": "זוכן" };
const he: MessageTable<UiKey> = { "nav.home": "בית", "nav.search": "חיפוש" };
const t = createT<UiKey>({ en, yi, he }, "he");
export const label: string = t("nav.home");
