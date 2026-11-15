// A topic page (concept-live-corpus C.2), first cut: the C1.7 route stub over `/data/topic/<id>.json`.
// C2.5 replaces the body (topic map, mixes, grades); the route, its data file, prerender and SEO stay.
import { corpusLabel, formatClock, isUiLang, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useEffect, useState, type JSX } from "react";
import { Link, useParams } from "react-router";
import { CorpusLabel } from "../components/CorpusLabel.tsx";
import { Text } from "../components/Text.tsx";
import { loadTopic, type TopicFile } from "../data/index.ts";
import { tFor } from "../i18n/index.ts";
import { clip } from "../seo/head.ts";
import { seoPageFor, TITLE_SEPARATOR, type SeoMetaArgs } from "../seo/meta.ts";

const paths = livePaths();

export function meta({ params, location, matches }: SeoMetaArgs): { title: string }[] {
  const ui: UiLang = isUiLang(params["ui"]) ? params["ui"] : "en";
  const page = seoPageFor(location.pathname, matches);
  const name = page?.title.trim() ? clip(page.title, 120) : corpusLabel("index.topics", ui);
  return [{ title: `${name}${TITLE_SEPARATOR}${tFor(ui)("site.name")}` }];
}

type State = { status: "loading" } | { status: "missing" } | { status: "ok"; file: TopicFile };

export default function Topic(): JSX.Element {
  const { ui: rawUi, topicId = "" } = useParams();
  const ui: UiLang = isUiLang(rawUi) ? rawUi : "en";
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadTopic(topicId)
      .then((file) => live && setState({ status: "ok", file }))
      .catch(() => live && setState({ status: "missing" }));
    return () => {
      live = false;
    };
  }, [topicId]);

  const f = state.status === "ok" ? state.file : null;
  return (
    <article aria-busy={state.status === "loading"} data-topic={topicId}>
      <h1>{f ? <Text value={f.label[ui]} lang={ui} /> : corpusLabel("kind.topic", ui)}</h1>
      {f?.label.he ? <Text as="p" value={f.label.he} lang="he" /> : null}
      {state.status === "missing" ? <p>{tFor(ui)("page.notFound.lead")}</p> : null}
      {f ? <TopicBody file={f} ui={ui} /> : null}
    </article>
  );
}

function TopicBody({ file: f, ui }: { file: TopicFile; ui: UiLang }): JSX.Element {
  return (
    <>
      {f.breadcrumb.length > 0 ? (
        <nav aria-label={corpusLabel("index.topics", ui)}>
          {f.breadcrumb.map((b, i) => (
            <span key={b.id}>
              {i > 0 ? " › " : null}
              <Link to={paths.topic(ui, b.id)}>
                <Text value={b.label[ui]} lang={ui} />
              </Link>
            </span>
          ))}
        </nav>
      ) : null}
      <CorpusLabel ui={ui} reviewed={f.reviewed} />
      {f.description ? <Text as="p" value={f.description} lang={ui} /> : null}
      {f.term ? (
        <p data-term={f.term.conceptId}>
          <Text value={f.term.he} lang="he" />: <Text value={f.term.definition} lang={ui} />
        </p>
      ) : null}
      {f.moments.length > 0 ? (
        <section>
          <ol data-testid="topic-moments">
            {f.moments.map((m) => (
              <li key={m.id} data-moment={m.id}>
                <Link to={paths.shiur(ui, m.shiurId, { t: m.t, m: m.id })}>
                  <Text value={m.title} lang={ui} />
                </Link>{" "}
                <span>{formatClock(m.t)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {f.hubs.length > 0 ? (
        <ul data-testid="topic-hubs">
          {f.hubs.map((h) => (
            <li key={h.id}>
              <Link to={paths.shiur(ui, h.id)} data-shiur={h.id}>
                <Text value={h.title} shiurLang={h.lang} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {f.children.length > 0 ? (
        <ul data-testid="topic-children">
          {f.children.map((c) => (
            <li key={c.id}>
              <Link to={paths.topic(ui, c.id)}>
                <Text value={c.label[ui]} lang={ui} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {f.threads.length > 0 ? (
        <ul data-testid="topic-threads">
          {f.threads.map((t) => (
            <li key={t.id}>
              {t.page ? (
                <Link to={paths.thread(ui, t.id)}>
                  <Text value={t.label} lang={ui} />
                </Link>
              ) : (
                <Text value={t.label} lang={ui} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {f.stories.length > 0 ? (
        <ul data-testid="topic-stories">
          {f.stories.map((st) => (
            <li key={st.id}>
              {st.page ? (
                <Link to={paths.story(ui, st.id)}>
                  <Text value={st.title} lang={ui} />
                </Link>
              ) : (
                <Text value={st.title} lang={ui} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
