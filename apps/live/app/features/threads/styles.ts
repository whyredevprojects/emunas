/** Typed access to `Threads.module.css` (same pattern as `shell/styles.ts`); a test checks the list. */
import raw from "./Threads.module.css";

export const THREADS_CLASSES = [
  "button",
  "buttons",
  "chip",
  "chips",
  "groupTitle",
  "insight",
  "insightButton",
  "kicker",
  "list",
  "member",
  "meta",
  "muted",
  "page",
  "primary",
  "section",
  "status",
  "summary",
  "timeline",
  "title",
  "year",
  "yearLabel",
] as const;

export type ThreadsClass = (typeof THREADS_CLASSES)[number];

export const threadsStyles: Readonly<Record<ThreadsClass, string>> = Object.fromEntries(
  THREADS_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<ThreadsClass, string>;
