// A thread page, "A teaching the Rav returns to" (concept-live-corpus C.1), first cut: the C1.7 route
// stub over `/data/thread/<id>.json`. C3.3 replaces the body (timeline, play the thread). Thread pages
// are always noindex with no canonical (D8; app/seo).
import { corpusLabel, formatHebrewYear, isUiLang, languageName, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useEffect, useState, type JSX } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CorpusLabel } from "../components/CorpusLabel.tsx";
import { Text } from "../components/Text.tsx";
import { DataError, findRedirect, loadThread, type ThreadFile } from "../data/index.ts";
import { tFor } from "../i18n/index.ts";
import { clip } from "../seo/head.ts";
import { seoPageFor, TITLE_SEPARATOR, type SeoMetaArgs } from "../seo/meta.ts";

const paths = livePaths();

export function meta({ params, location, matches }: SeoMetaArgs): { title: string }[] {
  const ui: UiLang = isUiLang(params["ui"]) ? params["ui"] : "en";
  const page = seoPageFor(location.pathname, matches);
  const name = page?.title.trim() ? clip(page.title, 120) : corpusLabel("thread.heading", ui);
  return [{ title: `${name}${TITLE_SEPARATOR}${tFor(ui)("site.name")}` }];
}

type State = { status: "loading" } | { status: "missing" } | { status: "ok"; file: ThreadFile };

export default function Thread(): JSX.Element {
  const { ui: rawUi, threadId = "" } = useParams();
  const ui: UiLang = isUiLang(rawUi) ? rawUi : "en";
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadThread(threadId)
      .then((file) => live && setState({ status: "ok", file }))
      .catch(async (e: unknown) => {
        if (!(e instanceof DataError && e.status === 404)) return live && setState({ status: "missing" });
        const r = await findRedirect("th", threadId).catch(() => null);
        if (!live) return;
        if (r?.kind === "page" && r.route === "th") navigate(paths.thread(ui, r.id), { replace: true });
        else setState({ status: "missing" });
      });
    return () => {
      live = false;
    };
  }, [threadId, ui, navigate]);

  const f = state.status === "ok" ? state.file : null;
  return (
    <article aria-busy={state.status === "loading"} data-thread={threadId}>
      <p>{corpusLabel("thread.heading", ui)}</p>
      <h1>{f ? <Text value={f.label} lang={ui} /> : corpusLabel("thread.heading", ui)}</h1>
      {state.status === "missing" ? <p>{tFor(ui)("page.notFound.lead")}</p> : null}
      {f ? (
        <>
          <CorpusLabel ui={ui} reviewed={f.reviewed} />
          <Text as="p" value={f.summary} lang={ui} />
          <ol data-testid="thread-members">
            {f.members.map((m) => (
              <li key={m.momentId} data-lang={m.lang}>
                <span>{m.year === null ? "" : formatHebrewYear(m.year, ui)}</span> <span>{languageName(m.lang, ui)}</span>{" "}
                <Link to={paths.shiur(ui, m.shiurId, { ...(m.t === null ? {} : { t: m.t }), m: m.momentId })}>
                  <Text value={m.title} shiurLang={m.lang} />
                </Link>
                {m.text ? <Text as="p" value={m.text} lang={ui} /> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </article>
  );
}
