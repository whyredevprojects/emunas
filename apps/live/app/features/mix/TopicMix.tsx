/**
 * "Play this topic" (concept-live-corpus C.2 item 2, C.3): the topic mix on a topic page.
 *
 * The header states the pool (sections and shiurim in the listener's audio language), how many items
 * play and for about how long, and that the mix was assembled automatically from AI tags. The first
 * items come from the topic file; when they cannot fill the mix (a language filter on a large topic),
 * pressing play, save or share loads the topic's moment pages (ids and times only) first, so opening
 * the page loads nothing beyond the topic file.
 */
import type { Ed } from "@emunas/corpus/public";
import { formatClock, formatNumber, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useMemo, useState, type JSX } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import { loadTopicMoments, type TopicFile, type TopicMomentsFile } from "../../data/index.ts";
import { useSettings } from "../../shell/settings.ts";
import { mixLink, playMix, saveMix } from "./actions.ts";
import { aboutMinutes, MIX_SIZE, topicMix, type AudioFilter, type Mix, type MixSource } from "./model.ts";
import { mixT } from "./strings.ts";
import { mixStyles as s } from "./styles.ts";

const paths = livePaths();

export interface TopicMixProps {
  file: TopicFile;
  ui: UiLang;
  /** Reading language for section titles. */
  read: Ed;
  /** Loads a moment page (tests pass a stub; default: the data client). */
  loadPage?: (topicId: string, page: number) => Promise<TopicMomentsFile>;
}

/** The pool's size in the listener's language, from the topic file's totals (read defensively). */
export function poolTotals(file: TopicFile, audio: AudioFilter, fallback: Mix): { sections: number; shiurim: number } {
  if (audio === "both") return { sections: file.momentTotal, shiurim: file.momentShiurim };
  const byLang = (file as Partial<TopicFile>).momentLangs?.[audio];
  return byLang ? { sections: byLang.sections, shiurim: byLang.shiurim } : { sections: fallback.sections, shiurim: fallback.shiurim };
}

type Status = "idle" | "loading" | "error" | "saved" | "shared";

export function TopicMix({ file, ui, read, loadPage = (id, n) => loadTopicMoments(id, n) }: TopicMixProps): JSX.Element | null {
  const t = mixT(ui);
  const audio = useSettings((st) => st.audio);
  const [extra, setExtra] = useState<MixSource[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [link, setLink] = useState<string | null>(null);
  const pool: MixSource[] = useMemo(() => [...file.moments, ...(extra ?? [])], [file.moments, extra]);
  const mix = useMemo(() => topicMix(pool, { audio }), [pool, audio]);
  const totals = poolTotals(file, audio, mix);
  const label = file.label[ui];

  /** The mix over the whole pool: loads the moment pages when the first items cannot fill it. */
  async function fullMix(): Promise<Mix> {
    if (extra !== null || mix.items.length >= MIX_SIZE || file.momentPages <= 0) return mix;
    setStatus("loading");
    const pages = await Promise.all(Array.from({ length: file.momentPages }, (_, i) => loadPage(file.id, i + 1)));
    const more = pages.flatMap((p) => p.moments);
    setExtra(more);
    return topicMix([...file.moments, ...more], { audio });
  }

  async function run(action: (m: Mix) => Promise<Status>): Promise<void> {
    try {
      const m = await fullMix();
      setStatus(await action(m));
    } catch {
      setStatus("error");
    }
  }

  if (file.momentTotal === 0) return null;
  const headingId = `mix-${file.id}`;
  return (
    <section className={s.mix} aria-labelledby={headingId} data-testid="topic-mix">
      <h2 id={headingId} className={s.title}>
        {t("mix.title")}
      </h2>
      <p className={s.header} data-testid="mix-header" data-sections={totals.sections} data-shiurim={totals.shiurim}>
        <Text value={label} lang={ui} />
        {`: ${t("mix.header", {
          sections: t("mix.sections", { count: totals.sections }),
          shiurim: t("mix.shiurim", { count: totals.shiurim }),
        })} `}
        {mix.items.length > 0
          ? t("mix.playing", { count: mix.items.length, minutes: formatNumber(aboutMinutes(mix.seconds), ui) })
          : t("mix.empty")}
      </p>
      <p className={s.auto} data-mix-label="auto">
        {t("mix.auto")}
      </p>
      <div className={s.actions}>
        <button
          type="button"
          className={`${s.button} ${s.primary}`}
          disabled={mix.items.length === 0 || status === "loading"}
          data-testid="mix-play"
          onClick={() => void run(async (m) => ((await playMix(m.items)) > 0 ? "idle" : "error"))}
        >
          {status === "loading" ? t("mix.preparing") : t("mix.play")}
        </button>
        <button
          type="button"
          className={s.button}
          disabled={mix.items.length === 0 || status === "loading"}
          data-testid="mix-save"
          onClick={() =>
            void run(async (m) => {
              await saveMix(t("mix.playlistName", { label }), m.items);
              return "saved";
            })
          }
        >
          {t("mix.save")}
        </button>
        <button
          type="button"
          className={s.button}
          disabled={mix.items.length === 0 || status === "loading"}
          data-testid="mix-share"
          onClick={() =>
            void run(async (m) => {
              const href = new URL(mixLink(ui, m.items), window.location.href).toString();
              setLink(href);
              try {
                await navigator.clipboard.writeText(href);
              } catch {
                /* the link is shown for manual copying */
              }
              return "shared";
            })
          }
        >
          {t("mix.share")}
        </button>
      </div>
      <p role="status" className={s.muted}>
        {status === "saved" ? t("mix.saved") : status === "shared" ? t("mix.copied") : status === "error" ? t("mix.error") : ""}
      </p>
      {link !== null ? (
        <input className={s.link} readOnly value={link} aria-label={t("mix.linkLabel")} data-testid="mix-link" onFocus={(e) => e.currentTarget.select()} />
      ) : null}
      {mix.items.length > 0 ? (
        <ol className={s.items} aria-label={t("mix.items")} data-testid="mix-items">
          {mix.items.map((x) => (
            <li key={x.id} data-moment={x.id} data-lang={x.lang}>
              <Link to={paths.shiur(ui, x.shiurId, { t: x.t, m: x.id })}>
                {x.title ? <Text value={x.title} lang={read} /> : <span>{formatClock(x.t)}</span>}
              </Link>{" "}
              <span className={s.meta}>
                {formatClock(x.t)}–{formatClock(x.end)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
