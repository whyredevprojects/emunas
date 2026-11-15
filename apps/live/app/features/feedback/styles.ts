/** Typed access to `Feedback.module.css` (pattern of `shell/styles.ts`; `feedback.test.tsx` checks the list). */
import raw from "./Feedback.module.css";

export const FEEDBACK_CLASSES = [
  "actions",
  "count",
  "dialog",
  "error",
  "form",
  "icon",
  "label",
  "lead",
  "note",
  "over",
  "popover",
  "reason",
  "reasons",
  "secondary",
  "status",
  "title",
  "trigger",
  "visuallyHidden",
  "widget",
] as const;

export type FeedbackClass = (typeof FEEDBACK_CLASSES)[number];

export const feedbackStyles: Readonly<Record<FeedbackClass, string>> = Object.fromEntries(
  FEEDBACK_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<FeedbackClass, string>;
