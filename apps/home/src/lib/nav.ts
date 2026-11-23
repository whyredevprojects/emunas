/**
 * The primary navigation of the home site, in header order. `path` is language-neutral
 * (`homePath` in lib/lang-path.ts gives each language's URL); `label` is a key of src/i18n/.
 */
import type { UiKey } from "../i18n/index.ts";

export interface NavItem {
  readonly path: string;
  readonly label: UiKey;
}

export const NAV: readonly NavItem[] = [
  { path: "/about/", label: "nav.about" },
  { path: "/essays/", label: "nav.essays" },
  { path: "/sefarim/", label: "nav.sefarim" },
  { path: "/weekly-devar-torah/", label: "nav.devarTorah" },
  { path: "/contact/", label: "nav.contact" },
];
