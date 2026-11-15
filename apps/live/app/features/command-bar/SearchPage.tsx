/**
 * `/:ui/search?q=` (tech-live §1, §4.4; concept-live §8): full moment search through `/api/search`,
 * grouped by shiur with the field each hit matched. The query lives in the URL, so a search can be
 * shared and the back button works. While typing, the search runs after 250 ms of idle (≥ 3
 * characters); Enter runs it at once.
 *
 * When the API cannot be reached (offline, error, timeout, bad response) the page shows the client
 * engine's shiur-level matches with a visible "Showing shiur-level results" notice.
 */
import type { Ed } from "@emunas/corpus/public";
import { notice, type UiLang } from "@emunas/i18n";
import { useEffect, useMemo, useRef, useState, type FormEvent, type JSX } from "react";
import { Link, useSearchParams } from "react-router";
import { loadCorpus, type CorpusRow } from "./live-data.ts";
import { tFor, useUi } from "../../i18n/index.ts";
import { audioAllows, readingLang, useSettings } from "../../shell/settings.ts";
import { useLoad } from "../today/use-data.ts";
import { ApiGroups, FallbackList } from "./Results.tsx";
import { SuggestionLabel } from "./SuggestionLabel.tsx";
import { groupByShiur, IDLE_MS, MIN_IDLE_CHARS, suggestionHref, suggestionId } from "./model.ts";
import { searchT } from "./strings.ts";
import { searchStyles as s } from "./styles.ts";
import { useFullSearch, useQuickSearch, type FullState } from "./use-search.ts";

const PAGE_SIZE = 20;

function useCorpusRows(): ReadonlyMap<string, CorpusRow> {
  const corpus = useLoad(() => loadCorpus(), []);
  return useMemo(
    () => new Map(corpus.status === "ok" ? corpus.data.shiurim.map((r) => [r.id, r] as const) : []),
    [corpus],
  );
}

export function SearchPage(): JSX.Element {
  const ui = useUi();
  const t = searchT(ui);
  const [params, setParams] = useSearchParams();
  const urlQ = (params.get("q") ?? "").trim();
  const [value, setValue] = useState(urlQ);
  const lastSet = useRef(urlQ);
  const audioFilter = useSettings((st) => st.audio);
  const read = useSettings((st) => readingLang(st, ui));
  const rows = useCorpusRows();
  const quick = useQuickSearch(ui, true);
  const full = useFullSearch(urlQ || null, {
    ui,
    limit: PAGE_SIZE,
    ...(audioFilter === "both" ? {} : { audio: [audioFilter] }),
  });

  // The URL changed from outside (command bar, back button): show that query in the field.
  useEffect(() => {
    if (urlQ !== lastSet.current) {
      lastSet.current = urlQ;
      setValue(urlQ);
    }
  }, [urlQ]);

  function setQuery(q: string, replace: boolean) {
    const v = q.trim();
    if (v === urlQ) return;
    lastSet.current = v;
    const next = new URLSearchParams(params);
    if (v) next.set("q", v);
    else next.delete("q");
    setParams(next, { replace, preventScrollReset: true });
  }

  // Search after 250 ms of idle while typing.
  useEffect(() => {
    const v = value.trim();
    if (v === urlQ || [...v].length < MIN_IDLE_CHARS) return;
    const id = setTimeout(() => setQuery(v, true), IDLE_MS);
    return () => clearTimeout(id);
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setQuery(value, false);
  }

  const typed = value.trim();
  const suggestions = quick.engine && typed ? quick.engine.suggest(typed, 6) : [];

  return (
    <article className={s.page} aria-busy={full.state.phase === "loading"}>
      <h1 className={s.title}>{tFor(ui)("page.search")}</h1>
      <p className={s.lead}>{t("search.lead")}</p>
      <form className={s.form} role="search" aria-label={t("search.form")} onSubmit={onSubmit}>
        <label className={s.visuallyHidden} htmlFor="search-q">
          {t("search.input")}
        </label>
        <input
          id="search-q"
          className={s.input}
          type="search"
          name="q"
          dir="auto"
          autoComplete="off"
          enterKeyHint="search"
          placeholder={searchT(ui)("cb.placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className={s.button} type="submit">
          {t("search.submit")}
        </button>
      </form>
      {suggestions.length > 0 ? (
        <nav aria-label={t("cb.goTo")}>
          <ul className={s.chips} data-testid="search-suggestions">
            {suggestions.map((sg) => (
              <li key={suggestionId(sg)}>
                <Link className={s.chip} to={suggestionHref(ui, sg)}>
                  <SuggestionLabel sg={sg} ui={ui} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <Body state={full.state} more={full.more} ui={ui} read={read} rows={rows} audioFilter={audioFilter} />
    </article>
  );
}

function Body(props: {
  state: FullState;
  more: () => void;
  ui: UiLang;
  read: Ed;
  rows: ReadonlyMap<string, CorpusRow>;
  audioFilter: "both" | Ed;
}): JSX.Element {
  const { state, more, ui, read, rows, audioFilter } = props;
  const t = searchT(ui);
  const status = (text: string) => (
    <p className={s.muted} role="status" data-testid="search-status">
      {text}
    </p>
  );

  switch (state.phase) {
    case "idle":
      return status(t("search.empty"));
    case "loading":
      return status(t("cb.searching"));
    case "api": {
      const groups = groupByShiur(state.pages);
      const count = groups.reduce((n, g) => n + g.hits.length, 0);
      if (groups.length === 0) return status(t("search.noResults", { q: state.q }));
      return (
        <>
          <p className={s.muted} role="status" data-testid="search-status">
            {t("search.summary", { count, shiurim: t("search.shiurim", { count: groups.length }) })}
          </p>
          <p className={s.aiNote}>{notice("aiNotesShort", ui)}</p>
          <ApiGroups groups={groups} rows={rows} ui={ui} read={read} />
          {state.stale ? <p className={s.notice}>{t("search.restart")}</p> : null}
          {state.next ? (
            <button className={s.button} type="button" onClick={more} disabled={state.loadingMore}>
              {state.loadingMore ? t("cb.searching") : t("search.more")}
            </button>
          ) : null}
        </>
      );
    }
    case "fallback": {
      const hits = (state.hits ?? []).filter((h) => h.lang === null || audioAllows(audioFilter, h.lang));
      return (
        <>
          <div className={s.notice} role="status" data-testid="fallback-notice">
            <strong>{t("cb.fallback")}</strong>
            <p className={s.muted}>{t(state.reason === "offline" ? "cb.fallback.offline" : "cb.fallback.failed")}</p>
          </div>
          {state.hits === null ? (
            <p className={s.muted}>{t("cb.searching")}</p>
          ) : hits.length === 0 ? (
            <p className={s.muted}>{t("search.noResults", { q: state.q })}</p>
          ) : (
            <>
              <p className={s.aiNote}>{notice("aiNotesShort", ui)}</p>
              <FallbackList hits={hits} rows={rows} ui={ui} read={read} />
            </>
          )}
        </>
      );
    }
  }
}
