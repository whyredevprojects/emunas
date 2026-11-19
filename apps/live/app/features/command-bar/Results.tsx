/**
 * Result lists of the search page: moment hits from `/api/search` grouped by shiur, and the
 * shiur-level fallback from the client engine. Every string shown is either a catalog field from
 * `corpus.json` (shiur title) or generated text returned by the API (`title`, `snippet.text`); a
 * result carries no other text (see `api.ts`).
 */
import { audioLanguageLabel, formatClock, formatHebrewYears, UI_DIR, type UiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import type { CorpusRow } from "./live-data.ts";
import type { ApiResult, ApiSnippet } from "./api.ts";
import type { QuickField, ShiurHit } from "./engine.ts";
import { splitMarks } from "./highlight.ts";
import { hitHref, hitTitle, shiurHref, type ShiurGroup } from "./model.ts";
import { searchT, type SearchKey } from "./strings.ts";
import { searchStyles as s } from "./styles.ts";

export function SnippetText({ snippet }: { snippet: ApiSnippet }): JSX.Element {
  return (
    <p className={s.snippet} lang={snippet.lang} dir={UI_DIR[snippet.lang]}>
      {splitMarks(snippet.text, snippet.marks).map((r, i) =>
        r.mark ? <mark key={i}>{r.text}</mark> : <span key={i}>{r.text}</span>,
      )}
    </p>
  );
}

/** "Chapter title", "Insight text", "Story, similar in meaning". */
export function matchedLabel(hit: Pick<ApiResult, "kind" | "matched">, ui: UiLang): string {
  const t = searchT(ui);
  const kind = t(`search.kind.${hit.kind}` as SearchKey);
  return t(`search.matched.${hit.matched}` as SearchKey, { kind });
}

function ShiurMeta({ row, ui }: { row: CorpusRow | undefined; ui: UiLang }): JSX.Element | null {
  if (!row) return null;
  const years = row.years.length > 0 ? formatHebrewYears(row.years, ui) : null;
  return (
    <p className={s.muted}>
      {audioLanguageLabel(row.lang, ui)}
      {years ? ` · ${years}` : ""}
    </p>
  );
}

function ShiurTitle({ shiurId, row, ui }: { shiurId: string; row: CorpusRow | undefined; ui: UiLang }): JSX.Element {
  return (
    <h2 className={s.groupTitle}>
      <Link to={shiurHref(ui, shiurId)}>
        {row ? <Text value={row.title} shiurLang={row.lang} /> : searchT(ui)("search.open")}
      </Link>
    </h2>
  );
}

export function HitItem({ hit, ui, read }: { hit: ApiResult; ui: UiLang; read: UiLang }): JSX.Element {
  const t = searchT(ui);
  const title = hitTitle(hit, read);
  const time = formatClock(hit.t);
  return (
    <li className={s.hit} data-moment={hit.momentId}>
      <Link className={s.hitLink} to={hitHref(ui, hit)}>
        <span className={s.time} aria-hidden="true">
          {time}
        </span>
        <span className={s.visuallyHidden}>{t("search.play", { time })}: </span>
        {title ? <Text value={title.text} lang={title.lang} /> : <span>{t(`search.kind.${hit.kind}` as SearchKey)}</span>}
      </Link>
      <span className={s.matched}>{t("search.matched", { what: matchedLabel(hit, ui) })}</span>
      {hit.snippet ? <SnippetText snippet={hit.snippet} /> : null}
    </li>
  );
}

export function ApiGroups(props: {
  groups: ShiurGroup[];
  rows: ReadonlyMap<string, CorpusRow>;
  ui: UiLang;
  read: UiLang;
}): JSX.Element {
  const { groups, rows, ui, read } = props;
  const t = searchT(ui);
  return (
    <ol className={s.results} data-testid="search-results" data-source="api">
      {groups.map((g) => {
        const row = rows.get(g.shiurId);
        const more = g.count - g.hits.length;
        return (
          <li key={g.shiurId} className={s.group} data-shiur={g.shiurId}>
            <ShiurTitle shiurId={g.shiurId} row={row} ui={ui} />
            <ShiurMeta row={row} ui={ui} />
            <ol className={s.hits}>
              {g.hits.map((h) => (
                <HitItem key={h.momentId} hit={h} ui={ui} read={read} />
              ))}
            </ol>
            {more > 0 ? <p className={s.muted}>{t("search.groupMore", { count: more })}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function fieldsLabel(fields: readonly QuickField[], ui: UiLang): string {
  const t = searchT(ui);
  return fields.map((f) => t(`search.field.${f}` as SearchKey)).join(", ");
}

export function FallbackList(props: {
  hits: ShiurHit[];
  rows: ReadonlyMap<string, CorpusRow>;
  ui: UiLang;
  read: UiLang;
}): JSX.Element {
  const { hits, rows, ui, read } = props;
  const t = searchT(ui);
  return (
    <ol className={s.results} data-testid="search-results" data-source="fallback">
      {hits.map((h) => {
        const row = rows.get(h.shiurId);
        const oneLiner = row?.oneLiner ?? null;
        return (
          <li key={h.shiurId} className={s.group} data-shiur={h.shiurId}>
            <h2 className={s.groupTitle}>
              <Link to={shiurHref(ui, h.shiurId)}>
                <Text value={h.title} shiurLang={h.lang ?? null} />
              </Link>
            </h2>
            <ShiurMeta row={row} ui={ui} />
            {oneLiner ? <Text as="p" className={s.snippet} value={oneLiner} lang={read} /> : null}
            {h.fields.length > 0 ? (
              <span className={s.matched}>{t("search.matched", { what: fieldsLabel(h.fields, ui) })}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
