/**
 * Typed access to `Shell.module.css`. Vite types CSS Modules as a string index, which is
 * `string | undefined` under `noUncheckedIndexedAccess`; this lists the classes once, and
 * `shell.test.tsx` checks the list against the stylesheet so a renamed class cannot go unnoticed.
 */
import raw from "./Shell.module.css";

export const SHELL_CLASSES = [
  "bare",
  "brand",
  "dialog",
  "dialogTitle",
  "dock",
  "dockIdle",
  "header",
  "lang",
  "langButton",
  "langSwitch",
  "lead",
  "main",
  "page",
  "pageTitle",
  "popover",
  "radio",
  "radioGroup",
  "radioLabel",
  "rail",
  "railLink",
  "railList",
  "railOut",
  "railOutIcon",
  "shell",
  "skip",
  "stubNote",
] as const;

export type ShellClass = (typeof SHELL_CLASSES)[number];

/** Class names by key. Falls back to the key itself when CSS Modules are not processed (unit tests). */
export const styles: Readonly<Record<ShellClass, string>> = Object.fromEntries(
  SHELL_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<ShellClass, string>;
