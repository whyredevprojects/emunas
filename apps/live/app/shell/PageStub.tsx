/**
 * Placeholder body for routes whose pages arrive in waves 3–4. Every stub has exactly one `h1` (focus
 * target after navigation) and a lead paragraph; params are shown through `<Text>` because they can
 * be data keys in any script.
 */
import { isUiLang, type UiLang } from "@emunas/i18n";
import type { JSX, ReactNode } from "react";
import { Link } from "react-router";
import { Text } from "../components/Text.tsx";
import { tFor, useT, type UiKey } from "../i18n/index.ts";
import { styles } from "./styles.ts";

export interface PageStubProps {
  title: UiKey;
  lead: UiKey;
  /** Values for `{name}` placeholders in the lead; each is rendered direction-isolated. */
  params?: Readonly<Record<string, string>>;
  children?: ReactNode;
}

/** Splits a template on `{name}` placeholders so each value can be wrapped in `<Text>`. */
function withIsolatedParams(template: string, params: Readonly<Record<string, string>>): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let last = 0;
  for (const m of template.matchAll(re)) {
    const name = m[1]!;
    const value = params[name];
    if (value === undefined) continue;
    out.push(template.slice(last, m.index));
    out.push(<Text key={`${name}-${m.index}`} value={value} shiurLang={null} />);
    last = m.index + m[0].length;
  }
  out.push(template.slice(last));
  return out;
}

export function PageStub({ title, lead, params, children }: PageStubProps): JSX.Element {
  const t = useT();
  // Without params, t() leaves `{name}` placeholders in place for withIsolatedParams to fill.
  const raw = t(lead);
  return (
    <article className={styles.page}>
      <h1 className={styles.pageTitle}>{t(title)}</h1>
      <p className={styles.lead}>{params ? withIsolatedParams(raw, params) : raw}</p>
      {children}
      <p className={styles.stubNote}>{t("stub.note")}</p>
    </article>
  );
}

export function NotFound({ ui }: { ui: UiLang }): JSX.Element {
  const t = tFor(ui);
  return (
    <article className={styles.page}>
      <h1 className={styles.pageTitle}>{t("page.notFound")}</h1>
      <p className={styles.lead}>{t("page.notFound.lead")}</p>
      <p>
        <Link to={`/${ui}/`}>{t("page.notFound.home")}</Link>
      </p>
    </article>
  );
}

/** `<title>` for a stub page. */
export function stubTitle(ui: UiLang, key: UiKey): string {
  const t = tFor(ui);
  return `${t(key)} · ${t("site.name")}`;
}

/**
 * A route `meta` export: the page kind as the title, in the interface language. It sets only the
 * title. Robots, canonical, hreflang and OG tags come from `SeoHead` in the root layout
 * (`app/seo`, W4.5), which marks a page `noindex` by its kind (`seo/policy.ts`), not by whether it
 * is a stub. Prerendered content pages use `seoMeta` (`seo/meta.ts`) instead, which titles them
 * with the shiur's, series', sefer's or entity's own name.
 */
export function stubMeta(key: UiKey) {
  return ({ params }: { params: Readonly<Record<string, string | undefined>> }) => {
    const ui = params["ui"];
    return [{ title: stubTitle(isUiLang(ui) ? ui : "en", key) }];
  };
}
