import { createT, type MessageTable } from "../../../../src/index.ts";

const en = { "nav.home": "Home", "nav.search": "Search" } as const;
type UiKey = keyof typeof en;
const yi: MessageTable<UiKey> = { "nav.home": "היים" };

const t = createT<UiKey>({ en, yi }, "yi");
export const label: string = t("nav.home");
