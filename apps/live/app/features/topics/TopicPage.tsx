/**
 * A topic page (concept-live-corpus C.2), from one file: `/data/topic/<id>.json` (plan §4: "Opening a
 * topic"). In order:
 *
 * 1. Label in the interface language, the loshon-hakodesh name, breadcrumb, the generated
 *    description (absent when null), the AI label once under the title (E.3). A topic whose concept
 *    shares its subject shows that concept's definition as "the term".
 * 2. Play this topic: the mix (`features/mix`).
 * 3. Start here: the hub shiurim as cards.
 * 4. Threads in this topic: a thread of three or more shiurim links to its page; a two-shiur thread is
 *    a line, never a link or a headline (E.2).
 * 5. Stories told here.
 * 6. All shiurim: main, then discussed (by salience, then year), then "touched on in" rows that link
 *    straight to the tagged section. Further rows load on request from `topic-shiurim/<id>.<n>.json`.
 * 8. Sub-topics and "often together with".
 *
 * Item 7 (over the years) is second cut. Language is shown on every shiur row and never groups rows
 * (F.1). Everything here is AI-generated and unreviewed unless the topic says `reviewed`.
 */
import type { Ed } from "@emunas/corpus/public";
import { corpusLabel, formatClock, formatHebrewYear, formatNumber, languageName, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router";
import { CorpusLabel } from "../../components/CorpusLabel.tsx";
import { Text } from "../../components/Text.tsx";
import {
  DataError,
  loadTopic,
  loadTopicShiurim,
  type TopicFile,
  type TopicShiurRow,
  type TopicShiurimFile,
} from "../../data/index.ts";
import { tFor } from "../../i18n/index.ts";
import { readingLang, useSettings } from "../../shell/settings.ts";
import { TopicMix } from "../mix/index.ts";
import { ShiurCard } from "../today/ShiurCard.tsx";
import { hebrewName } from "./labels.ts";
import { topicsT } from "./strings.ts";
import { topicsStyles as s } from "./styles.ts";

const paths = livePaths();

type State = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ok"; file: TopicFile };

export interface TopicPageProps {
  topicId: string;
  ui: UiLang;
  /** Loads a further "all shiurim" page (tests pass a stub; default: the data client). */
  loadShiurimPage?: (topicId: string, page: number) => Promise<TopicShiurimFile>;
}

export function TopicPage({ topicId, ui, loadShiurimPage = (id, n) => loadTopicShiurim(id, n) }: TopicPageProps): JSX.Element {
  const t = topicsT(ui);
  const read = useSettings((st) => readingLang(st, ui));
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadTopic(topicId).then(
      (file) => live && setState({ status: "ok", file }),
      (e: unknown) => live && setState({ status: e instanceof DataError && e.status === 404 ? "missing" : "error" }),
    );
    return () => {
      live = false;
    };
  }, [topicId]);

  const f = state.status === "ok" ? state.file : null;
  const he = f ? hebrewName(f.label, ui) : null;
  return (
    <article className={s.page} aria-busy={state.status === "loading"} data-topic={topicId}>
      <header className={s.head}>
        {f && f.breadcrumb.length > 0 ? (
          <nav className={s.crumbs} aria-label={corpusLabel("index.topics", ui)} data-testid="topic-breadcrumb">
            <ol>
              {f.breadcrumb.map((b) => (
                <li key={b.id}>
                  <Link to={paths.topic(ui, b.id)}>
                    <Text value={b.label[ui]} lang={ui} />
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className={s.title}>{f ? <Text value={f.label[ui]} lang={ui} /> : corpusLabel("kind.topic", ui)}</h1>
        {he ? <Text as="p" className={s.hebrew} value={he} lang="he" /> : null}
        {f ? <CorpusLabel ui={ui} reviewed={f.reviewed} className={s.label} /> : null}
        {f ? (
          <p className={s.meta} data-testid="topic-count">
            {t("topic.count", { count: f.count })}
          </p>
        ) : null}
      </header>
      {state.status === "loading" ? <p className={s.muted}>{t("topic.loading")}</p> : null}
      {state.status === "missing" ? <p className={s.muted}>{tFor(ui)("page.notFound.lead")}</p> : null}
      {state.status === "error" ? (
        <p role="alert" className={s.muted}>
          {t("topic.error")}
        </p>
      ) : null}
      {f ? <TopicBody file={f} ui={ui} read={read} loadShiurimPage={loadShiurimPage} /> : null}
    </article>
  );
}

function TopicBody({
  file: f,
  ui,
  read,
  loadShiurimPage,
}: {
  file: TopicFile;
  ui: UiLang;
  read: Ed;
  loadShiurimPage: (topicId: string, page: number) => Promise<TopicShiurimFile>;
}): JSX.Element {
  const t = topicsT(ui);
  return (
    <>
      {f.description ? <Text as="p" className={s.description} value={f.description} lang={read} /> : null}
      {f.term ? (
        <p className={s.term} data-term={f.term.conceptId}>
          <span className={s.termName}>{t("topic.term")}</span>{" "}
          {f.term.he ? (
            <>
              <Text value={f.term.he} lang="he" />
              {": "}
            </>
          ) : null}
          <Text value={f.term.definition} lang={read} />
        </p>
      ) : null}
      {f.person?.page || f.work?.page ? (
        <ul className={s.chips} data-testid="topic-same">
          {f.person?.page ? (
            <li>
              <Link className={s.chip} to={paths.person(ui, f.person.id)} data-person={f.person.id}>
                {t("topic.person", { name: f.person.label[ui] })}
              </Link>
            </li>
          ) : null}
          {f.work?.page ? (
            <li>
              <Link className={s.chip} to={paths.work(ui, f.work.id)} data-work={f.work.id}>
                {t("topic.work", { name: f.work.label[ui] })}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}

      <TopicMix file={f} ui={ui} read={read} />

      {f.hubs.length > 0 ? (
        <section className={s.section} aria-labelledby="topic-hubs-title">
          <h2 id="topic-hubs-title" className={s.sectionTitle}>
            {t("topic.startHere")}
          </h2>
          <ul className={s.cards} data-testid="topic-hubs">
            {f.hubs.map((h) => (
              <li key={h.id}>
                <ShiurCard shiur={h} ui={ui} read={read} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {f.threads.length > 0 ? (
        <section className={s.section} aria-labelledby="topic-threads-title">
          <h2 id="topic-threads-title" className={s.sectionTitle}>
            {t("topic.threads")}
          </h2>
          <ul className={s.list} data-testid="topic-threads">
            {f.threads.map((th) => (
              <li key={th.id} className={s.row} data-thread={th.id} data-page={th.page ? "true" : "false"}>
                {th.page ? (
                  <Link to={paths.thread(ui, th.id)}>
                    <Text value={th.label} lang={read} />
                  </Link>
                ) : (
                  <Text value={th.label} lang={read} />
                )}
                <span className={s.meta}>{t("topic.threads.count", { count: th.shiurCount })}</span>
              </li>
            ))}
          </ul>
          {f.threadTotal > f.threads.length ? <p className={s.meta}>{t("topic.threads.more", { count: f.threadTotal - f.threads.length })}</p> : null}
        </section>
      ) : null}

      {f.stories.length > 0 ? (
        <section className={s.section} aria-labelledby="topic-stories-title">
          <h2 id="topic-stories-title" className={s.sectionTitle}>
            {t("topic.stories")}
          </h2>
          <ul className={s.list} data-testid="topic-stories">
            {f.stories.map((st) => (
              <li key={st.id} className={s.row} data-story={st.id}>
                {st.page ? (
                  <Link to={paths.story(ui, st.id)}>
                    <Text value={st.title} lang={read} />
                  </Link>
                ) : (
                  <Text value={st.title} lang={read} />
                )}
                <span className={s.meta}>{t("topic.stories.told", { count: st.tellings })}</span>
              </li>
            ))}
          </ul>
          {f.storyTotal > f.stories.length ? <p className={s.meta}>{t("topic.stories.more", { count: f.storyTotal - f.stories.length })}</p> : null}
        </section>
      ) : null}

      <AllShiurim file={f} ui={ui} read={read} loadPage={loadShiurimPage} />

      {f.children.length > 0 ? (
        <section className={s.section} aria-labelledby="topic-children-title">
          <h2 id="topic-children-title" className={s.sectionTitle}>
            {t("topic.children")}
          </h2>
          <ul className={s.chips} data-testid="topic-children">
            {f.children.map((c) => (
              <li key={c.id}>
                <Link className={s.chip} to={paths.topic(ui, c.id)} data-topic-link={c.id}>
                  <Text value={c.label[ui]} lang={ui} />
                  <span className={s.meta}>{formatNumber(c.count, ui)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {f.coTopics.length > 0 ? (
        <section className={s.section} aria-labelledby="topic-cotopics-title">
          <h2 id="topic-cotopics-title" className={s.sectionTitle}>
            {t("topic.coTopics")}
          </h2>
          <ul className={s.chips} data-testid="topic-cotopics">
            {f.coTopics.map((c) => (
              <li key={c.id}>
                <Link className={s.chip} to={paths.topic(ui, c.id)} data-topic-link={c.id}>
                  <Text value={c.label[ui]} lang={ui} />
                  <span className={s.meta}>{t("topic.coTopics.sections", { count: c.sections })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Rows of the "all shiurim" list, split by grade (the order within each grade is the file's). */
export function groupRows(rows: readonly TopicShiurRow[]): Record<TopicShiurRow["grade"], TopicShiurRow[]> {
  const out: Record<TopicShiurRow["grade"], TopicShiurRow[]> = { main: [], discussed: [], touched: [] };
  for (const r of rows) (out[r.grade] ?? out.discussed).push(r);
  return out;
}

function AllShiurim({
  file: f,
  ui,
  read,
  loadPage,
}: {
  file: TopicFile;
  ui: UiLang;
  read: Ed;
  loadPage: (topicId: string, page: number) => Promise<TopicShiurimFile>;
}): JSX.Element | null {
  const t = topicsT(ui);
  const [more, setMore] = useState<TopicShiurRow[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [busy, setBusy] = useState<"idle" | "loading" | "error">("idle");
  useEffect(() => {
    setMore([]);
    setLoaded(0);
    setBusy("idle");
  }, [f.id]);
  const first = Array.isArray(f.shiurim) ? f.shiurim : [];
  const pages = typeof f.shiurPages === "number" ? f.shiurPages : 0;
  const rows = [...first, ...more];
  if (rows.length === 0) return null;
  const groups = groupRows(rows);

  async function next(): Promise<void> {
    setBusy("loading");
    try {
      const page = await loadPage(f.id, loaded + 1);
      setMore((m) => [...m, ...page.shiurim]);
      setLoaded((n) => n + 1);
      setBusy("idle");
    } catch {
      setBusy("error");
    }
  }

  const list = (xs: readonly TopicShiurRow[], grade: TopicShiurRow["grade"]) => (
    <ul className={s.list} data-grade={grade}>
      {xs.map((r) => (
        <ShiurRow key={r.id} row={r} ui={ui} read={read} />
      ))}
    </ul>
  );
  return (
    <section className={s.section} aria-labelledby="topic-shiurim-title" data-testid="topic-shiurim" data-total={f.shiurTotal}>
      <h2 id="topic-shiurim-title" className={s.sectionTitle}>
        {t("topic.shiurim")} <span className={s.meta}>{formatNumber(f.shiurTotal, ui)}</span>
      </h2>
      <p className={s.meta}>{t("topic.shiurim.lead")}</p>
      {groups.main.length > 0 ? (
        <>
          <h3 className={s.subTitle}>{corpusLabel("grade.main", ui)}</h3>
          {list(groups.main, "main")}
        </>
      ) : null}
      {groups.discussed.length > 0 ? (
        <>
          <h3 className={s.subTitle}>{corpusLabel("grade.discussed", ui)}</h3>
          {list(groups.discussed, "discussed")}
        </>
      ) : null}
      {groups.touched.length > 0 ? (
        <>
          <h3 className={s.subTitle}>{t("topic.touched")}</h3>
          {list(groups.touched, "touched")}
        </>
      ) : null}
      {loaded < pages ? (
        <button type="button" className={s.more} disabled={busy === "loading"} onClick={() => void next()} data-testid="topic-shiurim-more">
          {busy === "loading" ? t("topic.shiurim.loading") : t("topic.shiurim.more")}
        </button>
      ) : null}
      {busy === "error" ? (
        <p role="alert" className={s.muted}>
          {t("topic.shiurim.error")}
        </p>
      ) : null}
    </section>
  );
}

function ShiurRow({ row: r, ui, read }: { row: TopicShiurRow; ui: UiLang; read: Ed }): JSX.Element {
  const t = topicsT(ui);
  const year = r.year === null ? t("topic.undated") : formatHebrewYear(r.year, ui);
  const sec = r.grade === "touched" ? r.section : undefined;
  const href = sec ? paths.shiur(ui, r.id, { t: sec.t, m: sec.id }) : paths.shiur(ui, r.id);
  return (
    <li className={s.row} data-shiur-row={r.id} data-lang={r.lang}>
      <Link to={href} data-shiur={r.id} data-section={sec?.id}>
        <Text value={r.title} shiurLang={r.lang} />
      </Link>
      <span className={s.meta}>
        {year} · {languageName(r.lang, ui)}
      </span>
      {sec ? (
        <span className={s.meta} data-touched={sec.id}>
          {t("topic.touched.at", { time: formatClock(sec.t) })}
          <Text value={sec.title} lang={read} />
          {sec.count > 1 ? ` (${t("topic.touched.more", { count: sec.count - 1 })})` : null}
        </span>
      ) : null}
    </li>
  );
}
