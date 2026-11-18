/**
 * `/:ui/maasios/:storyId` (concept-live-corpus C.4): a story told at least twice, from
 * `story/<id>.json`. The merged retelling is shown once at the top, under the AI label. Below it the
 * telling switcher: every telling with year, language, shiur title and the title of the section it
 * sits in (what the Mashgiach used the story for each time), a button that plays that telling, and the
 * telling's own retelling, collapsed and loaded from its shiur file only when opened.
 *
 * Language is a property of each telling (F.1); the language filter only decides which telling the
 * page's play button starts with. An id with no story file (a retired or merged-away id, a story told
 * once) is a 404.
 */
import { corpusLabel, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router";
import { CorpusLabel } from "../../components/CorpusLabel.tsx";
import { Text } from "../../components/Text.tsx";
import { DataError, loadStory, type CorpusMember, type StoryFile } from "../../data/index.ts";
import { tFor } from "../../i18n/index.ts";
import { readingLang, useSettings } from "../../shell/settings.ts";
import { chooseTelling } from "./model.ts";
import { playTelling } from "./play.ts";
import { maasiosT } from "./strings.ts";
import { maasiosStyles as s } from "./styles.ts";
import { OwnRetelling, TellingLine } from "./Telling.tsx";

const paths = livePaths();

type State = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ok"; file: StoryFile };

export function StoryPage({ storyId, ui }: { storyId: string; ui: UiLang }): JSX.Element {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadStory(storyId).then(
      (file) => live && setState({ status: "ok", file }),
      (e: unknown) => live && setState({ status: e instanceof DataError && e.status === 404 ? "missing" : "error" }),
    );
    return () => {
      live = false;
    };
  }, [storyId]);

  const mt = maasiosT(ui);
  const t = tFor(ui);
  return (
    <article className={s.page} aria-busy={state.status === "loading"} data-story={storyId}>
      {state.status === "ok" ? (
        <StoryBody file={state.file} ui={ui} />
      ) : state.status === "missing" ? (
        // The site's 404 wording: a retired, merged-away or once-told story id has no page.
        <>
          <h1 className={s.title}>{t("page.notFound")}</h1>
          <p className={s.lead}>{t("page.notFound.lead")}</p>
          <p>
            <Link to={paths.stories(ui)}>{t("page.maasios")}</Link>
          </p>
        </>
      ) : (
        <>
          <h1 className={s.title}>{t("page.maasios")}</h1>
          {state.status === "loading" ? <p className={s.muted}>{mt("loading")}</p> : <p role="alert">{mt("error")}</p>}
        </>
      )}
    </article>
  );
}

function StoryBody({ file, ui }: { file: StoryFile; ui: UiLang }): JSX.Element {
  const mt = maasiosT(ui);
  const read = readingLang({ read: useSettings((x) => x.read) }, ui);
  const audio = useSettings((x) => x.audio);
  const [current, setCurrent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const play = (t: CorpusMember) => {
    if (t.t === null) return;
    setCurrent(t.momentId);
    setFailed(false);
    playTelling({ storyId: file.id, shiurId: t.shiurId, momentId: t.momentId, start: t.t }).catch(() => setFailed(true));
  };
  const first = chooseTelling(file.tellings, audio) ?? chooseTelling(file.tellings, "both");
  return (
    <>
      <Text as="h1" className={s.title} value={file.title} lang={read} />
      <CorpusLabel ui={ui} reviewed={file.reviewed} />
      {file.people.length > 0 ? (
        <p className={s.meta} data-testid="story-people">
          {file.people.map((p, i) =>
            "id" in p && p.page ? (
              <Link key={p.id} to={paths.person(ui, p.id)} data-entity={`p:${p.id}`}>
                <Text value={p.label} lang={ui} />
              </Link>
            ) : (
              <span key={"id" in p ? p.id : `n${i}`} data-name="">
                {"id" in p ? <Text value={p.label} lang={ui} /> : <Text value={p.name} shiurLang={null} />}
              </span>
            ),
          )}
        </p>
      ) : null}
      {file.attributionVaries ? <p data-testid="story-attribution-varies">{corpusLabel("story.attributionVaries", ui)}</p> : null}
      <Text as="p" className={s.retelling} value={file.retelling} lang={read} />
      <p className={s.status}>{corpusLabel("label.story", ui, { count: file.tellings.length })}</p>
      {first ? (
        <div className={s.buttons}>
          <button type="button" className={`${s.button} ${s.primary}`} data-action="play" onClick={() => play(first)}>
            {mt("story.play")}
          </button>
          {failed ? (
            <span className={s.status} role="status">
              {mt("only.failed")}
            </span>
          ) : null}
        </div>
      ) : null}

      <section className={s.section} aria-labelledby="story-tellings">
        <h2 id="story-tellings" className={s.groupTitle}>
          {mt("story.tellings")}
        </h2>
        <p className={s.muted}>{mt("story.tellings.lead")}</p>
        <ol className={s.list} data-testid="story-tellings">
          {file.tellings.map((t) => (
            <TellingRow key={t.momentId} telling={t} ui={ui} read={read} current={current === t.momentId} onPlay={() => play(t)} />
          ))}
        </ol>
      </section>
    </>
  );
}

function TellingRow({
  telling,
  ui,
  read,
  current,
  onPlay,
}: {
  telling: CorpusMember;
  ui: UiLang;
  read: UiLang;
  current: boolean;
  onPlay: () => void;
}): JSX.Element {
  const mt = maasiosT(ui);
  return (
    <li className={s.telling} data-telling={telling.momentId} data-lang={telling.lang} aria-current={current ? "true" : undefined}>
      <TellingLine ui={ui} telling={telling} at={telling} />
      <div className={s.buttons}>
        {telling.t !== null ? (
          <button type="button" className={s.button} onClick={onPlay} data-action="play-telling" aria-pressed={current}>
            {current ? mt("telling.playing") : mt("telling.play")}
          </button>
        ) : null}
      </div>
      <OwnRetelling at={telling} ui={ui} read={read} />
    </li>
  );
}
