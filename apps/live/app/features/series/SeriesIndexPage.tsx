/**
 * `/:ui/series`: every series (facets.json), a course and its other-language counterpart on one row.
 */
import { languageName, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import type { JSX } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import { loadFacets } from "../today/live-data.ts";
import { tFor, useUi } from "../../i18n/index.ts";
import { useLoad } from "../today/use-data.ts";
import { seriesIndex, type SeriesEntry } from "./model.ts";
import { seriesT } from "./strings.ts";
import { seriesStyles as s } from "./styles.ts";

const paths = livePaths();

export function SeriesIndexPage(): JSX.Element {
  const ui = useUi();
  const st = seriesT(ui);
  const facets = useLoad(() => loadFacets(), []);
  const rows = facets.status === "ok" ? seriesIndex(facets.data) : [];
  return (
    <article className={s.page} aria-busy={facets.status === "loading"}>
      <h1 className={s.title}>{tFor(ui)("page.series")}</h1>
      <p className={s.lead}>{st("series.lead")}</p>
      {facets.status === "error" ? (
        <p role="alert" className={s.muted}>
          {st("series.error")}
        </p>
      ) : facets.status === "loading" ? (
        <p className={s.muted}>{st("series.loading")}</p>
      ) : (
        <ul className={s.index} data-testid="series-index">
          {rows.map((row) => (
            <li key={row.entries[0]!.id} className={s.indexRow}>
              {row.entries.map((e) => (
                <IndexEntry key={e.id} entry={e} ui={ui} />
              ))}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function IndexEntry({ entry, ui }: { entry: SeriesEntry; ui: UiLang }): JSX.Element {
  const st = seriesT(ui);
  return (
    <div className={s.indexEntry} data-series={entry.id}>
      <Link className={s.indexLink} to={paths.series(ui, entry.id)}>
        <Text value={entry.label} lang={ui} />
      </Link>
      <span className={s.meta}>
        {st("series.lang", { lang: languageName(entry.lang, ui) })} · {st("series.parts", { count: entry.count })}
      </span>
    </div>
  );
}
