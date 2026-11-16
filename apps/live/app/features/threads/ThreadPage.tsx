/**
 * `/:ui/th/:threadId` (concept-live-corpus C.1, corpus-wave-plan C3.3): "A teaching the Rav returns
 * to", from `thread/<id>.json` (clusters with a page: three or more visible shiurim by default).
 *
 * At the top the heading, the cluster label and the AI label once, then the generated summary. Under
 * it the members: on a vertical year line when the build marks the thread for a timeline (three or
 * more dated members), else a plain list; members with no year sit in an "undated" group at the end
 * either way. Each row shows the year, the audio language, the shiur's catalog title as written, the
 * section the insight sits in and that shiur's own insight; tapping the insight plays its moment.
 * "Play the thread" queues the members in year order through the listener's shiur-language filter and
 * says how many were left out ("3 more in Yiddish").
 *
 * The page never says the wording is the same, never pairs a Yiddish member with an English one, and
 * there is no list of all threads (K). An id with no thread file (a two-shiur cluster, a retired id)
 * is a 404. Thread pages are always noindex with no canonical (D8; `app/seo`).
 */
import type { Ed } from "@emunas/corpus/public";
import { corpusLabel, formatHebrewYear, languageName, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useEffect, useMemo, useState, type JSX } from "react";
import { Link } from "react-router";
import { CorpusLabel } from "../../components/CorpusLabel.tsx";
import { Text } from "../../components/Text.tsx";
import { DataError, loadThread, type ThreadFile } from "../../data/index.ts";
import { tFor } from "../../i18n/index.ts";
import { readingLang, useSettings } from "../../shell/settings.ts";
import { membersOf, threadLayout, threadQueue, type ThreadMember, type ThreadQueueItem } from "./model.ts";
import { playInsight, playThread } from "./play.ts";
import { threadsT } from "./strings.ts";
import { threadsStyles as s } from "./styles.ts";

const paths = livePaths();

export interface ThreadPageProps {
  threadId: string;
  ui: UiLang;
}

type State = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ok"; file: ThreadFile };

export function ThreadPage({ threadId, ui }: ThreadPageProps): JSX.Element {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadThread(threadId).then(
      (file) => live && setState({ status: "ok", file }),
      (e: unknown) => live && setState({ status: e instanceof DataError && e.status === 404 ? "missing" : "error" }),
    );
    return () => {
      live = false;
    };
  }, [threadId]);

  const tt = threadsT(ui);
  const t = tFor(ui);
  return (
    <article className={s.page} aria-busy={state.status === "loading"} data-thread={threadId}>
      {state.status === "ok" ? (
        <ThreadBody file={state.file} ui={ui} />
      ) : state.status === "missing" ? (
        // The site's 404 wording: a two-shiur cluster, a retired or unknown id has no page.
        <>
          <h1 className={s.title}>{t("page.notFound")}</h1>
          <p className={s.muted}>{t("page.notFound.lead")}</p>
          <p>
            <Link to={paths.explore(ui)}>{t("nav.explore")}</Link>
          </p>
        </>
      ) : (
        <>
          <p className={s.kicker}>{corpusLabel("thread.heading", ui)}</p>
          <h1 className={s.title}>{corpusLabel("thread.heading", ui)}</h1>
          {state.status === "loading" ? <p className={s.muted}>{tt("loading")}</p> : <p role="alert">{tt("error")}</p>}
        </>
      )}
    </article>
  );
}

function ThreadBody({ file, ui }: { file: ThreadFile; ui: UiLang }): JSX.Element {
  const tt = threadsT(ui);
  const read = readingLang({ read: useSettings((x) => x.read) }, ui);
  const audio = useSettings((x) => x.audio);
  const members = useMemo(() => membersOf(file), [file]);
  const layout = useMemo(() => threadLayout(file, members), [file, members]);
  const queue = useMemo(() => threadQueue(members, audio), [members, audio]);
  const [current, setCurrent] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "playing"; count: number } | { kind: "failed" } | null>(null);

  const playOne = (m: ThreadMember) => {
    if (m.t === null) return;
    setCurrent(m.momentId);
    setStatus(null);
    playInsight({ shiurId: m.shiurId, momentId: m.momentId, start: m.t, lang: m.lang }).catch(() => setStatus({ kind: "failed" }));
  };
  const playAll = (items: readonly ThreadQueueItem[]) => {
    setCurrent(items[0]?.momentId ?? null);
    playThread(items).then(
      (count) => setStatus({ kind: "playing", count }),
      () => setStatus({ kind: "failed" }),
    );
  };

  const first = layout.years[0]?.year;
  const last = layout.years[layout.years.length - 1]?.year;
  const topics = Array.isArray(file.topics) ? file.topics.filter((x) => x && typeof x.id === "string") : [];
  const row = (m: ThreadMember) => (
    <MemberRow key={m.momentId} member={m} ui={ui} read={read} current={current === m.momentId} onPlay={() => playOne(m)} />
  );

  return (
    <>
      <header className={s.section}>
        <p className={s.kicker} data-testid="thread-heading">
          {corpusLabel("thread.heading", ui)}
        </p>
        <Text as="h1" className={s.title} value={file.label} lang={read} />
        <CorpusLabel ui={ui} reviewed={file.reviewed === true} />
      </header>
      {file.summary ? <Text as="p" className={s.summary} value={file.summary} lang={read} /> : null}
      <p className={s.status} data-testid="thread-count">
        {tt("count", { count: layout.shiurCount })}
        {first !== undefined && last !== undefined
          ? ` · ${first === last ? formatHebrewYear(first, ui) : tt("span", { from: formatHebrewYear(first, ui), to: formatHebrewYear(last, ui) })}`
          : ""}
      </p>
      {topics.length > 0 ? (
        <nav aria-label={tt("topics")}>
          <ul className={s.chips} data-testid="thread-topics">
            {topics.map((x) => (
              <li key={x.id}>
                <Link className={s.chip} to={paths.topic(ui, x.id)} data-topic-link={x.id}>
                  <Text value={x.label[ui]} lang={ui} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <section className={s.section} aria-labelledby="thread-play" data-testid="thread-play">
        <h2 id="thread-play" className={s.groupTitle}>
          {tt("play", { count: queue.items.length })}
        </h2>
        <p className={s.muted}>{tt("play.lead")}</p>
        <div className={s.buttons}>
          {queue.items.length > 0 ? (
            <button type="button" className={`${s.button} ${s.primary}`} data-action="play-thread" onClick={() => playAll(queue.items)}>
              {tt("play", { count: queue.items.length })}
            </button>
          ) : null}
          {status ? (
            <span className={s.status} role="status">
              {status.kind === "playing" ? tt("play.playing", { count: status.count }) : tt("play.failed")}
            </span>
          ) : null}
        </div>
        {queue.leftOut.length > 0 ? (
          <p className={s.status} data-testid="thread-left-out">
            {queue.leftOut.map((x) => tt("leftOut", { count: x.count, language: languageName(x.lang, ui) })).join(" · ")}. {tt("leftOut.why")}
          </p>
        ) : null}
        {queue.untimed > 0 ? <p className={s.status}>{tt("untimed", { count: queue.untimed })}</p> : null}
      </section>

      <section className={s.section} aria-labelledby="thread-members">
        <h2 id="thread-members" className={s.groupTitle}>
          {tt("members")}
        </h2>
        <p className={s.muted}>{tt("members.lead")}</p>
        <div data-testid="thread-members" data-layout={layout.timeline ? "timeline" : "list"}>
          {layout.timeline ? (
            <ol className={s.timeline}>
              {layout.years.map((g) => (
                <li key={g.year} className={s.year} data-year={g.year}>
                  <h3 className={s.yearLabel}>{formatHebrewYear(g.year, ui)}</h3>
                  <ol className={s.list}>{g.members.map(row)}</ol>
                </li>
              ))}
            </ol>
          ) : layout.years.length > 0 ? (
            <ol className={s.list}>{layout.years.flatMap((g) => g.members).map(row)}</ol>
          ) : null}
          {layout.undated.length > 0 ? (
            <section className={s.section} data-testid="thread-undated" aria-labelledby="thread-undated">
              <h3 id="thread-undated" className={s.yearLabel}>
                {tt("undated")}
              </h3>
              <ol className={s.list}>{layout.undated.map(row)}</ol>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}

function MemberRow({
  member: m,
  ui,
  read,
  current,
  onPlay,
}: {
  member: ThreadMember;
  ui: UiLang;
  read: Ed;
  current: boolean;
  onPlay: () => void;
}): JSX.Element {
  const tt = threadsT(ui);
  const text = m.text && (m.text.en !== "" || m.text.yi !== "") ? m.text : null;
  return (
    <li className={s.member} data-member={m.momentId} data-lang={m.lang} aria-current={current ? "true" : undefined}>
      <span className={s.meta}>
        <span data-year="">{m.year === null ? tt("undated") : formatHebrewYear(m.year, ui)}</span>
        <span data-lang-mark={m.lang}>{languageName(m.lang, ui)}</span>
        <Link to={paths.shiur(ui, m.shiurId, { ...(m.t === null ? {} : { t: m.t }), m: m.momentId })} data-moment={m.momentId}>
          <Text value={m.title} shiurLang={m.lang} />
        </Link>
        {m.chapterTitle ? <Text value={m.chapterTitle} lang={ui} /> : null}
      </span>
      {m.t !== null ? (
        <button type="button" className={s.insightButton} onClick={onPlay} data-action="play-member" aria-pressed={current}>
          {text ? <Text className={s.insight} value={text} lang={read} /> : tt("row.play")}
          <span className={s.status}> · {current ? tt("row.playing") : tt("row.play")}</span>
        </button>
      ) : text ? (
        <Text as="p" className={s.insight} value={text} lang={read} />
      ) : null}
    </li>
  );
}
