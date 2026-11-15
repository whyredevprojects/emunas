/** Typed access to `Maasios.module.css` (same pattern as `shell/styles.ts`); a test checks the list. */
import raw from "./Maasios.module.css";

export const MAASIOS_CLASSES = [
  "button",
  "buttons",
  "card",
  "cardTitle",
  "chip",
  "chips",
  "field",
  "groupTitle",
  "lead",
  "list",
  "meta",
  "muted",
  "page",
  "primary",
  "retelling",
  "section",
  "select",
  "status",
  "telling",
  "title",
] as const;

export type MaasiosClass = (typeof MAASIOS_CLASSES)[number];

export const maasiosStyles: Readonly<Record<MaasiosClass, string>> = Object.fromEntries(
  MAASIOS_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<MaasiosClass, string>;
