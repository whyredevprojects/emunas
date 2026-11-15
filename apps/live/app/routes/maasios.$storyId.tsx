// A story page with its tellings (concept-live-corpus C.4), first cut: the C1.7 route stub over
// `/data/story/<id>.json` (stories told at least twice). C2.7 replaces the body (telling switcher).
import { corpusLabel, formatHebrewYear, isUiLang, languageName, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useEffect, useState, type JSX } from "react";
import { Link, useParams } from "react-router";
import { CorpusLabel } from "../components/CorpusLabel.tsx";
import { Text } from "../components/Text.tsx";
import { loadStory, type StoryFile } from "../data/index.ts";
import { tFor } from "../i18n/index.ts";
import { clip } from "../seo/head.ts";
import { seoPageFor, TITLE_SEPARATOR, type SeoMetaArgs } from "../seo/meta.ts";

const paths = livePaths();

export function meta({ params, location, matches }: SeoMetaArgs): { title: string }[] {
  const ui: UiLang = isUiLang(params["ui"]) ? params["ui"] : "en";
  const page = seoPageFor(location.pathname, matches);
  const name = page?.title.trim() ? clip(page.title, 120) : tFor(ui)("page.maasios");
  return [{ title: `${name}${TITLE_SEPARATOR}${tFor(ui)("site.name")}` }];
}

type State = { status: "loading" } | { status: "missing" } | { status: "ok"; file: StoryFile };

export default function Story(): JSX.Element {
  const { ui: rawUi, storyId = "" } = useParams();
  const ui: UiLang = isUiLang(rawUi) ? rawUi : "en";
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadStory(storyId)
      .then((file) => live && setState({ status: "ok", file }))
      .catch(() => live && setState({ status: "missing" }));
    return () => {
      live = false;
    };
  }, [storyId]);

  const f = state.status === "ok" ? state.file : null;
  return (
    <article aria-busy={state.status === "loading"} data-story={storyId}>
      <h1>{f ? <Text value={f.title} lang={ui} /> : tFor(ui)("page.maasios")}</h1>
      {state.status === "missing" ? <p>{tFor(ui)("page.notFound.lead")}</p> : null}
      {f ? (
        <>
          <CorpusLabel ui={ui} reviewed={f.reviewed} />
          {f.people.length > 0 ? (
            <p data-testid="story-people">
              {f.people.map((p, i) => (
                <span key={"id" in p ? p.id : `name-${i}`}>
                  {i > 0 ? ", " : null}
                  {"id" in p && p.page ? (
                    <Link to={paths.person(ui, p.id)}>
                      <Text value={p.label[ui]} lang={ui} />
                    </Link>
                  ) : (
                    <Text value={"id" in p ? p.label[ui] : p.name} shiurLang={ui} />
                  )}
                </span>
              ))}
            </p>
          ) : null}
          {f.attributionVaries ? <p data-testid="story-attribution-varies">{corpusLabel("story.attributionVaries", ui)}</p> : null}
          <Text as="p" value={f.retelling} lang={ui} />
          <p>{corpusLabel("count.retoldFrom", ui, { count: f.tellings.length })}</p>
          <ol data-testid="story-tellings">
            {f.tellings.map((t) => (
              <li key={t.momentId} data-lang={t.lang}>
                <span>{t.year === null ? "" : formatHebrewYear(t.year, ui)}</span> <span>{languageName(t.lang, ui)}</span>{" "}
                <Link to={paths.shiur(ui, t.shiurId, { ...(t.t === null ? {} : { t: t.t }), m: t.momentId })}>
                  <Text value={t.title} shiurLang={t.lang} />
                </Link>
                {t.chapterTitle ? (
                  <>
                    {" · "}
                    <Text value={t.chapterTitle} lang={ui} />
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </article>
  );
}
