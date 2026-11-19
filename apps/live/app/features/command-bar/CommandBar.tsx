/**
 * The command bar (concept-live §4.2, tech-live §4.4): one field in the shell header, reachable from
 * anywhere with `/`.
 *
 * 1. On first focus it lazy-loads the client engine (`quick-index.<ui>.json` with its corpus entities,
 *    and `facets.json`; never `corpus.json`). Each keystroke then gives instant suggestions (topics,
 *    glossary entries, people and sefarim with a Live page, by corpus id; occasions, series, a year)
 *    with no network; "Tanya 12" fetches that series' file once.
 * 2. After 250 ms of idle with ≥ 3 characters it asks `/api/search` for the top moments. If that fails
 *    or the browser is offline, the list shows the engine's shiur-level matches instead, labelled
 *    "Showing shiur-level results".
 * 3. Enter opens the highlighted option, or the search page for the query.
 *
 * ARIA combobox pattern (input + listbox with `aria-activedescendant`); the input is `dir="auto"` so a
 * Hebrew query in the English interface runs right to left, and vice versa.
 */
import type { UiLang } from "@emunas/i18n";
import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { Text } from "../../components/Text.tsx";
import { audioAllows, readingLang, useSettings } from "../../shell/settings.ts";
import type { ApiResult } from "./api.ts";
import type { ShiurHit, Suggestion } from "./engine.ts";
import { matchedLabel } from "./Results.tsx";
import { SuggestionLabel } from "./SuggestionLabel.tsx";
import { groupByShiur, hitHref, hitTitle, IDLE_MS, MIN_IDLE_CHARS, searchHref, shiurHref, suggestionHref, suggestionId } from "./model.ts";
import { searchT } from "./strings.ts";
import { searchStyles as s } from "./styles.ts";
import { useFullSearch, useQuickSearch, useSuggestions } from "./use-search.ts";

type BarOption =
  | { kind: "suggestion"; id: string; href: string; sg: Suggestion }
  | { kind: "hit"; id: string; href: string; hit: ApiResult }
  | { kind: "shiur"; id: string; href: string; hit: ShiurHit }
  | { kind: "all"; id: string; href: string };

const MAX_SUGGESTIONS = 8;
const MAX_MOMENTS = 5;
const MAX_SHIURIM = 5;

/** True when a key event comes from a place where `/` is typed as text. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(type);
  }
  return false;
}

/** Debounced copy of `value`: the full search runs on the committed value only. */
function useIdleCommit(value: string, delay: number): [string, (v: string) => void] {
  const [committed, setCommitted] = useState("");
  useEffect(() => {
    const v = value.trim();
    if ([...v].length < MIN_IDLE_CHARS) {
      if (v.length === 0) setCommitted("");
      return;
    }
    const id = setTimeout(() => setCommitted(v), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return [committed, setCommitted];
}

export function CommandBar({ ui }: { ui: UiLang }): JSX.Element {
  const t = searchT(ui);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const labelId = useId();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const quick = useQuickSearch(ui);
  const [committed, commit] = useIdleCommit(value, IDLE_MS);
  const audioFilter = useSettings((st) => st.audio);
  const read = useSettings((st) => readingLang(st, ui));
  const full = useFullSearch(open ? committed : null, {
    ui,
    limit: MAX_MOMENTS,
    ...(audioFilter === "both" ? {} : { audio: [audioFilter] }),
  });

  // `/` from anywhere focuses the bar (not while typing elsewhere, not with modifiers).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const q = value.trim();
  const suggestions = useSuggestions(quick.engine, q, MAX_SUGGESTIONS);

  const options = useMemo<BarOption[]>(() => {
    if (!q) return [];
    const out: BarOption[] = suggestions.map((sg) => ({
      kind: "suggestion",
      id: `${listId}-${suggestionId(sg)}`,
      href: suggestionHref(ui, sg),
      sg,
    }));
    const st = full.state;
    if (st.phase === "api" && st.q === committed) {
      const hits = groupByShiur(st.pages)
        .flatMap((g) => g.hits)
        .slice(0, MAX_MOMENTS);
      for (const hit of hits) out.push({ kind: "hit", id: `${listId}-m-${hit.momentId}`, href: hitHref(ui, hit), hit });
    } else if (st.phase === "fallback" && st.q === committed && st.hits) {
      for (const hit of st.hits.filter((h) => h.lang === null || audioAllows(audioFilter, h.lang)).slice(0, MAX_SHIURIM)) {
        out.push({ kind: "shiur", id: `${listId}-s-${hit.shiurId}`, href: shiurHref(ui, hit.shiurId), hit });
      }
    }
    out.push({ kind: "all", id: `${listId}-all`, href: searchHref(ui, q) });
    return out;
  }, [q, suggestions, full.state, committed, ui, listId, audioFilter]);

  useEffect(() => setActive(-1), [q]);
  const activeOption = active >= 0 ? options[active] : undefined;

  function go(href: string) {
    setOpen(false);
    setActive(-1);
    setValue("");
    commit("");
    inputRef.current?.blur();
    void navigate(href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        if (options.length > 0) setActive((a) => (a + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setOpen(true);
        if (options.length > 0) setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeOption) go(activeOption.href);
        else if (q) go(searchHref(ui, q));
        break;
      case "Escape":
        if (open && q) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (q) {
          e.preventDefault();
          setValue("");
        }
        break;
      default:
        break;
    }
  }

  const st = full.state;
  const busy = quick.status === "loading" || (st.phase === "loading" && st.q === committed);
  const fallbackShown = st.phase === "fallback" && st.q === committed;
  const expanded = open && q.length > 0;
  const firstHit = options.findIndex((o) => o.kind === "hit" || o.kind === "shiur");

  const renderOption = (o: BarOption, i: number): JSX.Element => {
    const selected = i === active;
    const common = {
      id: o.id,
      role: "option" as const,
      "aria-selected": selected,
      className: s.option,
      onMouseDown: (e: MouseEvent) => e.preventDefault(),
      onClick: () => go(o.href),
      onMouseEnter: () => setActive(i),
      "data-href": o.href,
    };
    switch (o.kind) {
      case "suggestion":
        return (
          <li key={o.id} {...common} data-kind="suggestion">
            <SuggestionLabel sg={o.sg} ui={ui} />
          </li>
        );
      case "hit": {
        const title = hitTitle(o.hit, read);
        return (
          <li key={o.id} {...common} data-kind="moment">
            {title ? <Text value={title.text} lang={title.lang} /> : <span>{matchedLabel(o.hit, ui)}</span>}
            <span className={s.optionMeta}>{matchedLabel(o.hit, ui)}</span>
          </li>
        );
      }
      case "shiur":
        return (
          <li key={o.id} {...common} data-kind="shiur">
            <Text value={o.hit.title} shiurLang={o.hit.lang ?? null} />
          </li>
        );
      case "all":
        return (
          <li key={o.id} {...common} data-kind="all">
            <span>{t("cb.all", { q })}</span>
          </li>
        );
    }
  };

  const suggestionOptions = options.filter((o) => o.kind === "suggestion");
  const resultOptions = options.filter((o) => o.kind === "hit" || o.kind === "shiur");
  const allIndex = options.length - 1;

  return (
    <div className={s.bar} role="search" aria-label={t("cb.label")} data-testid="command-bar">
      <label id={labelId} className={s.visuallyHidden} htmlFor={`${listId}-input`}>
        {t("cb.label")}
      </label>
      <input
        ref={inputRef}
        id={`${listId}-input`}
        className={s.input}
        type="text"
        dir="auto"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-describedby={`${listId}-hint`}
        aria-activedescendant={expanded && activeOption ? activeOption.id : undefined}
        placeholder={t("cb.placeholder")}
        value={value}
        onFocus={() => {
          quick.ensure();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <span id={`${listId}-hint`} className={s.visuallyHidden}>
        {t("cb.hint")}
      </span>
      <div className={s.visuallyHidden} aria-live="polite" aria-atomic="true">
        {expanded ? (busy ? t("cb.searching") : fallbackShown ? t("cb.fallback") : "") : ""}
      </div>
      <ul id={listId} role="listbox" aria-labelledby={labelId} className={s.popup} hidden={!expanded}>
        {suggestionOptions.length > 0 ? (
          <li role="presentation">
            <div className={s.groupLabel} aria-hidden="true">
              {t("cb.goTo")}
            </div>
            <ul role="group" aria-label={t("cb.goTo")} className={s.groupList}>
              {suggestionOptions.map((o) => renderOption(o, options.indexOf(o)))}
            </ul>
          </li>
        ) : null}
        {resultOptions.length > 0 ? (
          <li role="presentation">
            <div className={s.groupLabel} aria-hidden="true" data-testid={fallbackShown ? "fallback-label" : undefined}>
              {fallbackShown ? t("cb.fallback") : t("cb.moments")}
            </div>
            <ul
              role="group"
              aria-label={fallbackShown ? t("cb.fallback") : t("cb.moments")}
              className={s.groupList}
            >
              {resultOptions.map((o) => renderOption(o, firstHit + resultOptions.indexOf(o)))}
            </ul>
          </li>
        ) : null}
        {busy ? (
          <li role="presentation" className={s.status}>
            {quick.status === "loading" ? t("cb.loadingIndex") : t("cb.searching")}
          </li>
        ) : null}
        {expanded && options[allIndex] ? renderOption(options[allIndex], allIndex) : null}
      </ul>
    </div>
  );
}
