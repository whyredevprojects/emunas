/**
 * Typed access to `Shelf.module.css` (same pattern as `shell/styles.ts`): the class list is written
 * once and a test checks it against the stylesheet.
 */
import raw from "./Shelf.module.css";

export const SHELF_CLASSES = [
  "actions",
  "back",
  "badge",
  "button",
  "empty",
  "field",
  "fieldset",
  "form",
  "input",
  "item",
  "itemMain",
  "itemMeta",
  "itemTitle",
  "lead",
  "list",
  "noteText",
  "notice",
  "page",
  "primary",
  "radio",
  "section",
  "sectionHead",
  "sectionTitle",
  "status",
  "textarea",
  "title",
  "toolbar",
] as const;

export type ShelfClass = (typeof SHELF_CLASSES)[number];

export const css: Readonly<Record<ShelfClass, string>> = Object.fromEntries(
  SHELF_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<ShelfClass, string>;

export const cx = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");
