/**
 * Companion tabs (concept-live §5.3), all time-linked: Read, Sources, Insights, Questions, Stories,
 * Related. The Transcript slot stays empty (`TRANSCRIPT_VIEW` is false; see `flags.ts`).
 */
import { formatClock, sourceRefParts } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs, type Key } from "react-aria-components";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import type { PublicSource } from "@emunas/corpus/public";
import type { Ed } from "./data.ts";
import { settingsStore } from "../../shell/settings.ts";
import type { FeedbackField } from "../feedback/index.ts";
import type { RoomContext } from "./context.ts";
import { activeParagraphId, groupSources, sefariaUrl } from "./model.ts";
import { AiLabel, Report, TimeButton, isActive } from "./parts.tsx";
import type { RoomKey } from "./strings.ts";
import { roomStyles as s } from "./styles.ts";
import { useCorpusRows, useWriteup } from "./use-room-data.ts";

export type TabId = "read" | "sources" | "insights" | "questions" | "stories" | "related";

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
  // Reserved slot (flags.ts): W5.2 appends its tab here behind `if (TRANSCRIPT_VIEW)`. Nothing is
  // imported for it today, so the bundle carries no such component.
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

const TAB_LABEL: Record<TabId, RoomKey> = {
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
  const tabs = availableTabs(room);
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
            {room.rt(TAB_LABEL[id])}
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
  const groups = groupSources(shiur.notes?.sources ?? []);
  return (
    <div>
      <AiLabel ui={ui} />
      {groups.map((g) => (
        <section key={g.key || "_"} className={s.group}>
          <h3 className={s.h3}>{g.work ? <Text value={g.work} shiurLang={shiur.lang} /> : rt("sources.unnamed")}</h3>
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
          </MomentItem>
        ))}
      </ul>
    </div>
  );
}

// ---- Related ---------------------------------------------------------------------------------

function ShiurLink({ room, id, t, rows }: { room: RoomContext; id: string; t?: number; rows: ReturnType<typeof useCorpusRows> }): JSX.Element {
  const row = rows?.get(id);
  const href = paths.shiur(room.ui, id, t === undefined ? {} : { t });
  return (
    <Link to={href} className={s.relatedLink}>
      {row ? <Text value={row.title} shiurLang={row.lang} /> : <Text value={id} lang="en" />}
      {row && row.years.length > 0 ? <span className={s.kind}> {row.years.join(", ")}</span> : null}
    </Link>
  );
}

function RelatedTab({ room }: { room: RoomContext }): JSX.Element {
  const { rt, shiur, ui } = room;
  const r = shiur.related;
  const rows = useCorpusRows(true);
  const same = r.sameOccasion.filter((id) => id !== shiur.id);
  const empty = same.length === 0 && !r.prev && !r.next && r.neighbors.length === 0 && !shiur.series;
  const sibling = room.siblingSeries;
  return (
    <div>
      {empty ? <p className={s.note}>{rt("related.none")}</p> : null}
      {same.length > 0 ? (
        <section className={s.group}>
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
      {r.prev || r.next || shiur.series ? (
        <section className={s.group}>
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
            {sibling ? (
              <li>
                <span className={s.kind}>{rt("related.otherLanguage")}: </span>
                <Link to={paths.series(ui, sibling.id)} className={s.relatedLink}>
                  {sibling.title ? sibling.title[ui] : <Text value={sibling.id} lang="en" />}
                </Link>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
      {r.neighbors.length > 0 ? (
        <section className={s.group}>
          <h3 className={s.h3}>{rt("related.neighbors")}</h3>
          <p className={s.note}>{rt("related.neighbors.note")}</p>
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
      {rows === null && !empty ? <p className={s.note}>{rt("related.loading")}</p> : null}
    </div>
  );
}
