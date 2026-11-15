/**
 * One telling of a story (concept-live-corpus C.4): its line (year, language, shiur title, the title
 * of the section it sits in) and, collapsed, the shiur's own retelling of the story. The retelling is
 * in that shiur's file and is loaded only when the listener opens it: the library and the story page
 * never fetch a retelling on their own.
 */
import type { Ed, L } from "@emunas/corpus/public";
import { formatHebrewYear, languageName, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useEffect, useId, useState, type JSX } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import { loadShiur, type ShiurFile } from "../../data/index.ts";
import { maasiosT } from "./strings.ts";
import { maasiosStyles as s } from "./styles.ts";

const paths = livePaths();

export interface TellingRef {
  shiurId: string;
  momentId: string;
  t: number | null;
}

/** What a shiur file says about one telling. */
export interface TellingFromShiur {
  title: string;
  lang: Ed;
  year: number | null;
  chapterTitle: L | null;
  /** The shiur's own retelling (null when the shiur has none for this moment). */
  retelling: L | null;
}

export function tellingFromShiur(file: Pick<ShiurFile, "catalog" | "lang" | "years" | "notes">, ref: TellingRef): TellingFromShiur {
  const story = file.notes?.stories.find((x) => x.id === ref.momentId);
  const t = ref.t ?? story?.t ?? null;
  const chapter = t === null ? undefined : file.notes?.chapters.find((c) => t >= c.t && t < c.end);
  return {
    title: file.catalog.titleOriginal,
    lang: file.lang,
    year: file.years.length > 0 ? Math.min(...file.years) : null,
    chapterTitle: chapter ? chapter.title : null,
    retelling: story && (story.retelling.en !== "" || story.retelling.yi !== "") ? story.retelling : null,
  };
}

type Loaded = { status: "idle" } | { status: "loading" } | { status: "error" } | { status: "ok"; telling: TellingFromShiur };

/** Loads the telling from its shiur file once `open` turns true. */
function useTelling(ref: TellingRef, open: boolean): Loaded {
  const [state, setState] = useState<Loaded>({ status: "idle" });
  const { shiurId, momentId, t } = ref;
  const want = open || state.status !== "idle";
  useEffect(() => {
    if (!want) return;
    let live = true;
    setState({ status: "loading" });
    loadShiur(shiurId).then(
      (file) => live && setState({ status: "ok", telling: tellingFromShiur(file, { shiurId, momentId, t }) }),
      () => live && setState({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [want, shiurId, momentId, t]);
  return state;
}

/** Year, language, shiur title (a link to the moment) and the section title. */
export function TellingLine({
  ui,
  telling,
  at,
}: {
  ui: UiLang;
  telling: { year: number | null; lang: Ed; title: string; chapterTitle: L | null };
  at: TellingRef;
}): JSX.Element {
  const mt = maasiosT(ui);
  return (
    <span className={s.meta}>
      <span>{telling.year === null ? mt("telling.year.none") : formatHebrewYear(telling.year, ui)}</span>
      <span data-lang={telling.lang}>{languageName(telling.lang, ui)}</span>
      <Link to={paths.shiur(ui, at.shiurId, { ...(at.t === null ? {} : { t: at.t }), m: at.momentId })} data-moment={at.momentId}>
        <Text value={telling.title} shiurLang={telling.lang} />
      </Link>
      {telling.chapterTitle ? <Text value={telling.chapterTitle} lang={ui} /> : null}
    </span>
  );
}

function Retelling({ state, read, ui }: { state: Loaded; read: Ed; ui: UiLang }): JSX.Element | null {
  const mt = maasiosT(ui);
  if (state.status === "loading") return <p className={s.status}>{mt("telling.loading")}</p>;
  if (state.status === "error") return <p className={s.status}>{mt("telling.error")}</p>;
  if (state.status !== "ok") return null;
  const r = state.telling.retelling;
  return r ? <Text as="p" className={s.retelling} value={r} lang={read} /> : <p className={s.status}>{mt("telling.none")}</p>;
}

/** "As told in this shiur": the telling's own retelling, collapsed until asked for. */
export function OwnRetelling({ at, ui, read }: { at: TellingRef; ui: UiLang; read: Ed }): JSX.Element {
  const mt = maasiosT(ui);
  const [open, setOpen] = useState(false);
  const state = useTelling(at, open);
  const id = useId();
  return (
    <div>
      <button type="button" className={s.button} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} data-action="own-retelling">
        {open ? mt("telling.hide") : mt("telling.show")}
      </button>
      <div id={id} hidden={!open} data-retelling={at.momentId}>
        {open ? <Retelling state={state} read={read} ui={ui} /> : null}
      </div>
    </div>
  );
}

/**
 * A story told once, opened in place on its card: the telling's line, its retelling and a link to
 * the moment (the story has no page of its own; its address is the moment in the shiur).
 */
export function SingleTelling({ at, ui, read }: { at: TellingRef; ui: UiLang; read: Ed }): JSX.Element {
  const mt = maasiosT(ui);
  const [open, setOpen] = useState(false);
  const state = useTelling(at, open);
  const id = useId();
  return (
    <div>
      <button type="button" className={s.button} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} data-action="expand">
        {open ? mt("card.collapse") : mt("card.expand")}
      </button>
      <div id={id} hidden={!open} className={s.telling} data-retelling={at.momentId}>
        {open && state.status === "ok" ? <TellingLine ui={ui} telling={state.telling} at={at} /> : null}
        {open ? <Retelling state={state} read={read} ui={ui} /> : null}
      </div>
    </div>
  );
}
