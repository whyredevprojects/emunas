/**
 * The dedication (owner request, corpus-wave-plan F.3): `לעילוי נשמת אשר בן ישראל`, in Hebrew in
 * both interface languages, the last thing on every page. The root layout renders it once after
 * the page (shell, home, not-found and error pages alike), so every prerendered HTML file and the
 * SPA fallback carry it exactly once.
 */
import type { JSX } from "react";
import raw from "./Dedication.module.css";
import { DEDICATION } from "./dedication-text.ts";

export { DEDICATION };

export const DEDICATION_CLASSES = ["footer", "line"] as const;

type DedicationClass = (typeof DEDICATION_CLASSES)[number];

/** Class names by key; the key itself when CSS Modules are not processed (unit tests). */
const styles: Readonly<Record<DedicationClass, string>> = Object.fromEntries(
  DEDICATION_CLASSES.map((k) => [k, (raw as Readonly<Record<string, string | undefined>>)[k] ?? k]),
) as Record<DedicationClass, string>;

export function Dedication(): JSX.Element {
  return (
    <footer className={styles.footer} data-dedication-footer="">
      <p className={styles.line} dir="rtl" lang="he" data-dedication="">
        {DEDICATION}
      </p>
    </footer>
  );
}
