/**
 * `/`: in production the site Worker answers `/` with a redirect (integration-plan C20). This page is
 * the static fallback: it redirects on the client by the last interface language used here, then by
 * the browser's languages (Yiddish or Hebrew → yi), and shows both links for anyone without JS.
 */
import type { UiLang } from "@emunas/i18n";
import { useEffect, type JSX } from "react";
import { Link, useNavigate } from "react-router";
import { tFor } from "../i18n/index.ts";
import { readStoredUi } from "../shell/ui-preference.ts";

export function meta() {
  return [{ title: tFor("en")("site.name") }];
}

/** Picks the interface language from a stored choice, then from `navigator.languages`. */
export function preferredUi(stored: UiLang | null, languages: readonly string[]): UiLang {
  if (stored) return stored;
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "yi" || base === "ji" || base === "he" || base === "iw") return "yi";
    if (base === "en") return "en";
  }
  return "en";
}

export default function Home(): JSX.Element {
  const navigate = useNavigate();
  useEffect(() => {
    const langs = typeof navigator === "undefined" ? [] : navigator.languages;
    void navigate(`/${preferredUi(readStoredUi(), langs)}/${window.location.search}`, { replace: true });
  }, [navigate]);
  const en = tFor("en");
  const yi = tFor("yi");
  return (
    <main id="main" style={{ padding: "var(--space-xl)" }}>
      <h1>
        <span lang="en">{en("site.name")}</span>
      </h1>
      <p lang="en">{en("home.redirecting")}</p>
      <ul>
        <li>
          <Link to="/en/" lang="en" hrefLang="en">
            {en("home.en")}
          </Link>
        </li>
        <li>
          <Link to="/yi/" lang="yi" dir="rtl" hrefLang="yi">
            {yi("home.yi")}
          </Link>
        </li>
      </ul>
    </main>
  );
}
