/**
 * Companion tabs (concept-live §5.3), all time-linked: Read, Sources, Insights, Questions, Stories,
 * Related. The Transcript tab (W5.2, `features/transcript`) is appended only behind `TRANSCRIPT_VIEW`
 * (`app/config/feature-flags.ts`, false by default) and only when an approved file loaded, so the
 * default bundle carries no part of it.
 *
 * On the corpus layer (concept-live-corpus D, C.1, E.2, F.1), from the shiur file alone: insights in a
 * thread carry a thread mark (a two-shiur thread is one inline line with a play button, never a
 * headline), stories told elsewhere say so, sources group by merged work, and Related runs: threads
 * through this shiur, main topics, other years of the same occasion, then the automatic neighbours.
 * There is no "counterpart in the other language" item.
 */
import { audioLanguageLabel, formatClock, formatHebrewYear, sourceRefParts } from "@emunas/i18n";
import { livePaths, parseMomentId } from "@emunas/links";
import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs, type Key } from "react-aria-components";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import type { PublicSource } from "@emunas/corpus/public";
import { loadShiur, type Ed } from "./data.ts";
import { settingsStore } from "../../shell/settings.ts";
import type { FeedbackField } from "../feedback/index.ts";
import type { RoomContext } from "./context.ts";
import { groupSourcesByWork, insightMark, mainTopics, storyMark, threadsThrough, type PairedInsight } from "./corpus.ts";
import { activeParagraphId, sefariaUrl } from "./model.ts";
import { AiLabel, Report, TimeButton, isActive } from "./parts.tsx";
import type { RoomKey } from "./strings.ts";
import { roomStyles as s } from "./styles.ts";
import { relatedTitles, seriesTitle, useWriteup, type RelatedTitle } from "./use-room-data.ts";
import { playAt as enginePlayAt } from "../../player-ui/index.ts";
import { TRANSCRIPT_VIEW } from "../../config/feature-flags.ts";
import { TRANSCRIPT_TAB, TranscriptTab, transcriptT, useTranscripts } from "../transcript/index.ts";

export type TabId = "read" | "sources" | "insights" | "questions" | "stories" | "related" | typeof TRANSCRIPT_TAB;

const paths = livePaths();

/** Tabs that have content for this shiur, in display order. */
export function availableTabs(room: Pick<RoomContext, "shiur">): TabId[] {
  const n = room.shiur.notes;
  const out: TabId[] = [];
  if (n) {
    out.push("read");
    if (n.sources.length > 0) out.push("sources");
    if (n.summary.keyPoints.length + n.insights.length + n.takeaways.length > 0) out.push("insights");
    if (n.questions.length > 0) out.push("questions");
    if (n.stories.length > 0) out.push("stories");
  }
  out.push("related");
  // The Transcript tab is added by CompanionTabs (behind TRANSCRIPT_VIEW) once its files have loaded.
  return out;
}

/** The tab that shows a moment kind (`&m=` deep links open it). */
export function tabForMoment(momentId: string | null): TabId | null {
  if (!momentId) return null;
  const kind = /~(st|tk|kp|s|i|q)\d+$/.exec(momentId)?.[1];
  switch (kind) {
    case "kp":
    case "i":
    case "tk":
      return "insights";
    case "q":
      return "questions";
    case "st":
      return "stories";
    default:
      return null;
  }
}

const TAB_LABEL: Record<Exclude<TabId, typeof TRANSCRIPT_TAB>, RoomKey> = {
  read: "tab.read",
  sources: "tab.sources",
  insights: "tab.insights",
  questions: "tab.questions",
  stories: "tab.stories",
  related: "tab.related",
};

export function CompanionTabs({
  room,
  selected,
  onSelect,
}: {
  room: RoomContext;
  selected: TabId;
  onSelect: (id: TabId) => void;
}): JSX.Element {
  // TRANSCRIPT_VIEW is a build-time literal: with it false this whole branch (and the transcript
  // feature) is dropped by the bundler. The hook is never conditional at runtime.
  const transcripts = TRANSCRIPT_VIEW ? useTranscripts(room.shiur) : null;
  const tabs = availableTabs(room);
  if (TRANSCRIPT_VIEW && transcripts?.status === "ready" && transcripts.files.size > 0) tabs.push(TRANSCRIPT_TAB);
  const current = tabs.includes(selected) ? selected : tabs[0]!;
  return (
    <Tabs
      className={s.tabs}
      selectedKey={current}
      onSelectionChange={(k: Key) => onSelect(String(k) as TabId)}
      data-room-tabs=""
    >
      <TabList className={s.tabList} aria-label={room.rt("room.tabs")}>
        {tabs.map((id) => (
          <Tab key={id} id={id} className={s.tab} data-tab={id}>
            {TRANSCRIPT_VIEW && id === TRANSCRIPT_TAB ? transcriptT(room.ui)("tx.tab") : room.rt(TAB_LABEL[id as Exclude<TabId, typeof TRANSCRIPT_TAB>])}
          </Tab>
        ))}
      </TabList>
      {tabs.map((id) => (
        <TabPanel key={id} id={id} className={s.tabPanel}>
          {id === "read" ? <ReadTab room={room} /> : null}
          {id === "sources" ? <SourcesTab room={room} /> : null}
          {id === "insights" ? <InsightsTab room={room} /> : null}
          {id === "questions" ? <QuestionsTab room={room} /> : null}
          {id === "stories" ? <StoriesTab room={room} /> : null}
          {id === "related" ? <RelatedTab room={room} /> : null}
          {TRANSCRIPT_VIEW && id === TRANSCRIPT_TAB && transcripts?.status === "ready" ? (
            <TranscriptTab room={room} files={transcripts.files} />
          ) : null}
        </TabPanel>
      ))}
    </Tabs>
  );
}

// ---- Read ------------------------------------------------------------------------------------

function SourceChip({ room, source }: { room: RoomContext; source: PublicSource | undefined }): JSX.Element | null {
  if (!source) return null;
  const parts = sourceRefParts(source, room.ui);
  if (!parts) return null;
  const href = sefariaUrl(source);
  const label = <Text value={parts.text} shiurLang={room.shiur.lang} />;
  if (href) {
    return (
      <a className={s.chip} href={href} target="_blank" rel="noopener noreferrer">
        {label}
        <span className={s.visuallyHidden}> {room.rt("sources.newTab")}</span>
      </a>
    );
  }
  return (
    <span className={s.chip}>
      {parts.position === "before" ? `${parts.qualifier} ` : null}
      {label}
      {parts.position === "after" ? ` (${parts.qualifier})` : null}
    </span>
  );
}

function ReadTab({ room }: { room: RoomContext }): JSX.Element {
  const { shiur, rt, reading } = room;
  const w = useWriteup(shiur, reading);
  const container = useRef<HTMLDivElement>(null);
  const anchor = useRef<number | null>(null);
  const active = w.status === "ready" && room.now !== null ? activeParagraphId(w.file.blocks, room.now) : null;
  const sources = shiur.notes?.sources ?? [];

  // Language switch keeps position by sectionIndex (shared by both languages).
  const switchTo = (lang: Ed) => {
    const blocks = container.current?.querySelectorAll<HTMLElement>("[data-section-index]") ?? [];
    for (const b of blocks) {
      if (b.getBoundingClientRect().bottom > 0) {
        anchor.current = Number(b.dataset["sectionIndex"]);
        break;
      }
    }
    settingsStore.getState().setRead(lang);
  };
  useEffect(() => {
    if (w.status !== "ready" || anchor.current === null) return;
    const el = container.current?.querySelector<HTMLElement>(`[data-section-index="${anchor.current}"]`);
    anchor.current = null;
    el?.scrollIntoView?.({ block: "start" });
  }, [w]);

  return (
    <div ref={container}>
      <div className={s.langToggle} role="group" aria-label={rt("read.readingIn")}>
        {(["en", "yi"] as const).map((l) => (
          <button
            key={l}
            type="button"
            className={s.toggle}
            aria-pressed={reading === l}
            onClick={() => switchTo(l)}
            lang={l}
          >
            {l === "en" ? "English" : "אידיש"}
          </button>
        ))}
      </div>
      <AiLabel ui={room.ui} />
      {w.status === "loading" ? <p className={s.note}>{rt("read.loading")}</p> : null}
      {w.status === "missing" ? <p className={s.note}>{rt("read.missing")}</p> : null}
      {w.status === "ready"
        ? w.file.blocks.map((b) => (
            <section key={b.sectionIndex} className={s.block} data-section-index={b.sectionIndex} lang={w.lang} dir={w.lang === "yi" ? "rtl" : "ltr"}>
              {b.heading ? <Text as="h3" className={s.h3} value={b.heading} lang={w.lang} /> : null}
              {b.paragraphs.map((p) => {
                const on = p.id === active;
                return (
                  <div key={p.id} className={on ? `${s.paragraph} ${s.active}` : s.paragraph} aria-current={on ? "true" : undefined} data-paragraph={p.id}>
                    <Text as="p" value={p.text} lang={w.lang} />
                    <div className={s.paragraphFoot}>
                      <TimeButton room={room} t={p.t} />
                      {p.src.length > 0 ? (
                        <span className={s.chips} aria-label={rt("read.sources")}>
                          {p.src.map((i) => (
                            <SourceChip key={i} room={room} source={sources[i]} />
                          ))}
                        </span>
                      ) : null}
                      <Report room={room} id={p.id} field="summary" />
                    </div>
                  </div>
                );
              })}
            </section>
          ))
        : null}
    </div>
  );
}

// ---- Sources ---------------------------------------------------------------------------------

const MENTION_KEY = { quoted: "sources.quoted", paraphrased: "sources.paraphrased", alluded: "sources.alluded" } as const;

function SourcesTab({ room }: { room: RoomContext }): JSX.Element {
  const { rt, ui, shiur } = room;
  const groups = groupSourcesByWork(shiur);
  return (
    <div>
      <AiLabel ui={ui} />
      {groups.map((g) => (
        <section key={g.key || "_"} className={s.group} data-work-group={g.workId ?? ""}>
          <h3 className={s.h3}>{g.work ? <Text value={g.work} shiurLang={shiur.lang} /> : rt("sources.unnamed")}</h3>
          {g.workId && g.page ? (
            <Link to={paths.work(ui, g.workId)} className={s.outLink} data-work-page={g.workId}>
              {rt("sources.workPage")}
            </Link>
          ) : null}
          <ul className={s.itemList}>
            {g.sources.map((src) => {
              const parts = sourceRefParts(src, ui);
              const href = sefariaUrl(src);
              return (
                <li key={src.id} className={s.item} data-moment={src.id}>
                  <TimeButton room={room} t={src.t} />
                  <span className={s.itemBody}>
                    {parts ? (
                      <>
                        {parts.position === "before" ? `${parts.qualifier} ` : null}
                        <Text value={parts.text} shiurLang={shiur.lang} />
                        {parts.position === "after" ? ` (${parts.qualifier})` : null}
                      </>
                    ) : (
                      rt("sources.unnamed")
                    )}
                    <span className={s.kind}>{rt(MENTION_KEY[src.mention])}</span>
                    {href ? (
                      <a className={s.outLink} href={href} target="_blank" rel="noopener noreferrer">
                        {rt("sources.onSefaria")}
                        <span className={s.visuallyHidden}> {rt("sources.newTab")}</span>
                      </a>
                    ) : null}
                  </span>
                  <Report room={room} id={src.id} field="source" />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---- Insights --------------------------------------------------------------------------------

function MomentList({ room, title, items }: { room: RoomContext; title: string; items: { id: string; text: { en: string; yi: string }; t: number | null; end: number | null }[] }): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section className={s.group}>
      <h3 className={s.h3}>{title}</h3>
      <ul className={s.itemList}>
        {items.map((m) => (
          <MomentItem key={m.id} room={room} id={m.id} t={m.t} end={m.end}>
            <Text value={m.text} lang={room.reading} />
            <ThreadMark room={room} momentId={m.id} />
          </MomentItem>
        ))}
      </ul>
    </section>
  );
}

function MomentItem({ room, id, t, end, field = "summary", children }: { room: RoomContext; id: string; t: number | null; end: number | null; field?: FeedbackField; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLLIElement>(null);
  const focused = room.focusedMoment === id;
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView?.({ block: "center" });
  }, [focused]);
  const classes = [s.item];
  if (isActive(room.now, t, end)) classes.push(s.active);
  if (focused) classes.push(s.focused);
  return (
    <li ref={ref} className={classes.join(" ")} data-moment={id} aria-current={focused ? "location" : undefined}>
      <TimeButton room={room} t={t} />
      <span className={s.itemBody}>
        {focused ? <span className={s.visuallyHidden}>{room.rt("moment.focused")}: </span> : null}
        {children}
      </span>
      <Report room={room} id={id} field={field} />
    </li>
  );
}

/** "Taught in N other shiurim, Y1 to Y2", for the years a thread mark spans. */
function threadMarkText(room: RoomContext, others: number, years: [number, number] | null): string {
  const { rt, ui } = room;
  if (!years) return rt("thread.markNoYears", { count: others });
  const from = formatHebrewYear(years[0], ui, { civil: false });
  if (years[0] === years[1]) return rt("thread.markOneYear", { count: others, from });
  return rt("thread.mark", { count: others, from, to: formatHebrewYear(years[1], ui, { civil: false }) });
}

/** Loads the other shiur's file on the listener's tap and plays its insight there. */
async function playPaired(o: PairedInsight): Promise<void> {
  const file = await loadShiur(o.shiurId);
  const m = file.notes?.insights.find((x) => x.id === o.momentId);
  const t = m?.t ?? o.t;
  if (t === null) return;
  const end = m?.end ?? null;
  enginePlayAt({ shiur: file, seriesTitle: seriesTitle(file) }, t, end === null ? undefined : end);
}

/** A moment id of `shiurId` (`<shiurId>~<kind><n>`), so `&m=` can name it. */
function momentOf(shiurId: string, momentId: string): boolean {
  return parseMomentId(momentId)?.shiurId === shiurId;
}

/**
 * The thread mark of an insight (concept-live-corpus D, C.1): a thread with a page is a link,
 * "taught in N other shiurim, Y1 to Y2"; a two-shiur thread is the line "also taught in <shiur>,
 * <year>" with a play button, never a headline or a thread page.
 */
function ThreadMark({ room, momentId }: { room: RoomContext; momentId: string }): JSX.Element | null {
  const { rt, ui, shiur } = room;
  const mark = insightMark(shiur, momentId);
  if (!mark) return null;
  if (mark.kind === "thread") {
    return (
      <span className={s.mark} data-thread-mark={mark.threadId}>
        <Link to={paths.thread(ui, mark.threadId)}>{threadMarkText(room, mark.others, mark.years)}</Link>
      </span>
    );
  }
  const o = mark.other;
  const row = shiur.related.titles[o.shiurId];
  const opts = { ...(momentOf(o.shiurId, o.momentId) ? { m: o.momentId } : {}), ...(o.t === null ? {} : { t: o.t }) };
  return (
    <span className={s.mark} data-thread-pair={mark.threadId}>
      {rt("thread.also")}{" "}
      <Link to={paths.shiur(ui, o.shiurId, opts)}>
        {row ? <Text value={row.title} shiurLang={row.lang} /> : <Text value={o.shiurId} lang="en" />}
      </Link>
      {o.year !== null ? `, ${formatHebrewYear(o.year, ui, { civil: false })}` : null}
      <span className={s.kind}> {audioLanguageLabel(o.lang, ui)}</span>{" "}
      <button
        type="button"
        className={s.textAction}
        onClick={() => void playPaired(o)}
        disabled={o.t === null}
        data-play-pair={o.momentId}
      >
        {rt("thread.play")}
      </button>
    </span>
  );
}

function InsightsTab({ room }: { room: RoomContext }): JSX.Element {
  const n = room.shiur.notes!;
  return (
    <div>
      <AiLabel ui={room.ui} />
      <MomentList room={room} title={room.rt("insights.keyPoints")} items={n.summary.keyPoints} />
      <MomentList room={room} title={room.rt("insights.insights")} items={n.insights} />
      <MomentList room={room} title={room.rt("insights.takeaways")} items={n.takeaways} />
    </div>
  );
}

// ---- Questions -------------------------------------------------------------------------------

function QuestionsTab({ room }: { room: RoomContext }): JSX.Element {
  const { rt, reading } = room;
  const qs = room.shiur.notes!.questions;
  return (
    <div>
      <AiLabel ui={room.ui} />
      <ul className={s.itemList}>
        {qs.map((q) => {
          const focused = room.focusedMoment === q.id;
          return (
            <li key={q.id} className={focused ? `${s.question} ${s.focused}` : s.question} data-moment={q.id}>
              <Text as="p" className={s.questionText} value={q.q} lang={reading} />
              <div className={s.questionAnswer}>
                <span className={s.kind}>{rt("questions.answer")}</span> <Text value={q.a} lang={reading} />
              </div>
              <div className={s.paragraphFoot}>
                {q.tq !== null ? (
                  <button
                    type="button"
                    className={s.textAction}
                    onClick={() => room.playAt(q.tq!, q.ta !== null && q.ta > q.tq! ? q.ta : undefined)}
                    disabled={!room.playable}
                    data-seek={q.tq}
                    data-hear="question"
                  >
                    {rt("questions.hearQuestion")} <span className={s.timeText}>{formatClock(q.tq)}</span>
                  </button>
                ) : null}
                {q.ta !== null ? (
                  <button
                    type="button"
                    className={s.textAction}
                    onClick={() => room.playAt(q.ta!)}
                    disabled={!room.playable}
                    data-seek={q.ta}
                    data-hear="answer"
                  >
                    {rt("questions.hearAnswer")} <span className={s.timeText}>{formatClock(q.ta)}</span>
                  </button>
                ) : null}
                <Report room={room} id={q.id} field="summary" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- Stories ---------------------------------------------------------------------------------

/** "Told in N other shiurim" for a merged story told elsewhere; it opens the story page. */
function StoryMarkLine({ room, momentId }: { room: RoomContext; momentId: string }): JSX.Element | null {
  const mark = storyMark(room.shiur, momentId);
  if (!mark) return null;
  const text = room.rt("stories.toldElsewhere", { count: mark.others });
  return (
    <span className={s.mark} data-story-mark={mark.storyId}>
      {mark.page ? <Link to={paths.story(room.ui, mark.storyId)}>{text}</Link> : text}
    </span>
  );
}

function StoriesTab({ room }: { room: RoomContext }): JSX.Element {
  const { rt, reading, shiur } = room;
  const stories = shiur.notes!.stories;
  return (
    <div>
      <AiLabel ui={room.ui} />
      <ul className={s.itemList}>
        {stories.map((st) => (
          <MomentItem key={st.id} room={room} id={st.id} t={st.t} end={st.end}>
            <Text as="h3" className={s.h3} value={st.title} lang={reading} />
            {st.people.length > 0 ? (
              <p className={s.note}>
                {rt("stories.people")}:{" "}
                {st.people.map((p, i) => (
                  <span key={`${p}-${i}`}>
                    {i > 0 ? ", " : null}
                    <Text value={p} shiurLang={shiur.lang} />
                  </span>
                ))}
              </p>
            ) : null}
            <details className={s.details}>
              <summary>{rt("stories.retelling")}</summary>
              <Text as="p" value={st.retelling} lang={reading} />
            </details>
            <StoryMarkLine room={room} momentId={st.id} />
          </MomentItem>
        ))}
      </ul>
    </div>
  );
}

// ---- Related ---------------------------------------------------------------------------------

function ShiurLink({ room, id, t, rows }: { room: RoomContext; id: string; t?: number; rows: ReadonlyMap<string, RelatedTitle> }): JSX.Element {
  const row = rows.get(id);
  const href = paths.shiur(room.ui, id, t === undefined ? {} : { t });
  return (
    <Link to={href} className={s.relatedLink}>
      {row ? <Text value={row.title} shiurLang={row.lang} /> : <Text value={id} lang="en" />}
      {row && row.years.length > 0 ? <span className={s.kind}> {row.years.join(", ")}</span> : null}
    </Link>
  );
}

function RelatedTab({ room }: { room: RoomContext }): JSX.Element {
  const { rt, shiur, ui, reading } = room;
  const r = shiur.related;
  // Titles and labels come with the shiur file (G.1): no corpus-wide file is loaded for Related.
  const rows = relatedTitles(shiur);
  const threads = threadsThrough(shiur);
  const topics = mainTopics(shiur).filter((t) => t.page);
  const same = r.sameOccasion.filter((id) => id !== shiur.id);
  const empty = threads.length === 0 && topics.length === 0 && same.length === 0 && !r.prev && !r.next && r.neighbors.length === 0 && !shiur.series;
  return (
    <div>
      {empty ? <p className={s.note}>{rt("related.none")}</p> : null}
      {threads.length > 0 ? (
        <section className={s.group} data-related="threads">
          <h3 className={s.h3}>{rt("related.threads")}</h3>
          <ul className={s.linkList}>
            {threads.map((th) => (
              <li key={th.threadId} data-thread={th.threadId}>
                <Link to={paths.thread(ui, th.threadId)} className={s.relatedLink}>
                  {th.text ? <Text value={th.text} lang={reading} /> : threadMarkText(room, th.others, th.years)}
                </Link>
                {th.text ? <span className={s.kind}> {threadMarkText(room, th.others, th.years)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {topics.length > 0 ? (
        <section className={s.group} data-related="topics">
          <h3 className={s.h3}>{rt("related.topics")}</h3>
          <ul className={s.linkList}>
            {topics.map((t) => (
              <li key={t.id} data-topic={t.id}>
                <Link to={paths.topic(ui, t.id)} className={s.relatedLink}>
                  {rt("end.topic", { topic: t.label[ui] })}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {same.length > 0 ? (
        <section className={s.group} data-related="occasion">
          <h3 className={s.h3}>{rt("related.sameOccasion")}</h3>
          <ul className={s.linkList}>
            {same.map((id) => (
              <li key={id}>
                <ShiurLink room={room} id={id} rows={rows} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {r.neighbors.length > 0 ? (
        <section className={s.group} data-related="neighbors">
          <h3 className={s.h3}>{rt("related.neighbors")}</h3>
          <AiLabel ui={ui} />
          <ul className={s.linkList}>
            {r.neighbors.map((nb) => (
              <li key={nb.momentId}>
                <ShiurLink room={room} id={nb.shiurId} t={nb.t} rows={rows} />{" "}
                <span className={s.timeText}>{rt("time.at", { time: formatClock(nb.t) })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {r.prev || r.next || shiur.series ? (
        <section className={s.group} data-related="series">
          <h3 className={s.h3}>{rt("related.series")}</h3>
          <ul className={s.linkList}>
            {r.prev ? (
              <li>
                <span className={s.kind}>{rt("related.prev")}: </span>
                <ShiurLink room={room} id={r.prev} rows={rows} />
              </li>
            ) : null}
            {r.next ? (
              <li>
                <span className={s.kind}>{rt("related.next")}: </span>
                <ShiurLink room={room} id={r.next} rows={rows} />
              </li>
            ) : null}
            {shiur.series ? (
              <li>
                <Link to={paths.series(ui, shiur.series.id)} className={s.relatedLink}>
                  {room.info.seriesTitle ? room.info.seriesTitle[ui] : <Text value={shiur.series.id} lang="en" />}
                </Link>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
