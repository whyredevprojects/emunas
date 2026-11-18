/**
 * The listening room (concept-live §5.3, tech-live W8, integration-plan W3.7): header, chapters and
 * companion tabs over one shiur, bound to the app's one player engine.
 *
 * - Opening the room puts the shiur into the engine (paused) when nothing else is loaded, at the
 *   deep-link time (`?t=` or `&m=`, falling back to `t`); it never interrupts another shiur that is
 *   playing. Every play control seeks within the shiur or loads it there.
 * - Catalog-only shiurim (no derived data) still play: header from the catalog, the catalog title's
 *   own items as an untimed outline, related shiurim, and a line saying notes are being prepared.
 * - Every generated text surface carries the AI label; the corpus layer's label sits once in the header.
 * - Corpus layer (concept-live-corpus D): topic chips open the topic beside the shiur (`TopicPane`),
 *   and when the shiur ends the room offers what to hear next without playing it.
 */
import { isUiLang, type UiLang } from "@emunas/i18n";
import { useEffect, useMemo, useState, type JSX } from "react";
import { useLocation, useParams } from "react-router";
import { Text } from "../../components/Text.tsx";
import type { EntityChip, ShiurFile } from "./data.ts";
import { tFor } from "../../i18n/index.ts";
import {
  canPlay,
  ensureDockRegistered,
  getEngine,
  playAt as enginePlayAt,
  registerShiur,
  usePlayerState,
  type PlayingInfo,
} from "../../player-ui/index.ts";
import { readingLang, useSettings } from "../../shell/settings.ts";
import { Chapters } from "./Chapters.tsx";
import { EndOfShiur } from "./EndOfShiur.tsx";
import { TopicPane } from "./TopicPane.tsx";
import type { RoomContext } from "./context.ts";
import { RoomHeaderDetails } from "./Header.tsx";
import { hasPlayableAudio, resolveDeepLink } from "./model.ts";
import { currentQuietOrigin } from "./quiet-link.ts";
import { roomT } from "./strings.ts";
import { roomStyles as s } from "./styles.ts";
import { CompanionTabs, availableTabs, tabForMoment, type TabId } from "./tabs.tsx";
import { seriesTitle, useRoomData } from "./use-room-data.ts";

function useUiParam(): UiLang {
  const { ui } = useParams();
  return isUiLang(ui) ? ui : "en";
}

export function ListeningRoomPage(): JSX.Element {
  const ui = useUiParam();
  const rt = roomT(ui);
  const shiurId = useParams()["shiurId"] ?? "";
  const data = useRoomData(shiurId);

  useEffect(() => {
    ensureDockRegistered();
  }, []);

  if (data.status === "ready") return <Room key={data.shiur.id} ui={ui} shiur={data.shiur} />;

  // One h1 in every state, at the same place, so focus after navigation lands on it.
  return (
    <article className={s.room} aria-busy={data.status === "loading" ? "true" : undefined}>
      <header className={s.header}>
        <h1 className={s.title}>
          {data.status === "loading" ? rt("room.loading") : data.status === "notFound" ? rt("room.notFound") : rt("room.error")}
        </h1>
      </header>
      {data.status === "notFound" ? <p className={s.note}>{rt("room.notFound.lead")}</p> : null}
      {data.status === "error" ? (
        <>
          <p className={s.note}>{rt("room.error.lead")}</p>
          <button type="button" className={s.playButton} onClick={data.retry}>
            {rt("room.retry")}
          </button>
        </>
      ) : null}
    </article>
  );
}

function Room({ ui, shiur }: { ui: UiLang; shiur: ShiurFile }): JSX.Element {
  const rt = roomT(ui);
  const { search } = useLocation();
  const settings = useSettings((st) => st.read);
  const reading = readingLang({ read: settings }, ui);
  const state = usePlayerState();
  const quietOrigin = useMemo(() => currentQuietOrigin(), []);

  const info: PlayingInfo = useMemo(() => ({ shiur, seriesTitle: seriesTitle(shiur) }), [shiur]);

  const params = new URLSearchParams(search);
  const tParam = params.get("t");
  const mParam = params.get("m");
  const deep = useMemo(() => {
    const q = new URLSearchParams();
    if (tParam !== null) q.set("t", tParam);
    if (mParam !== null) q.set("m", mParam);
    return resolveDeepLink(shiur, q);
  }, [shiur, tParam, mParam]);

  // Put the shiur into the engine (paused) or follow a deep link within it.
  useEffect(() => {
    if (!canPlay()) return;
    const engine = getEngine();
    const current = engine.getState().shiurId;
    if (current === null) {
      registerShiur(info);
      engine.load(shiur, { start: deep.start ?? 0 });
    } else if (current === shiur.id) {
      registerShiur(info);
      if (deep.start !== null) engine.seek(deep.start);
    }
  }, [info, shiur, deep]);

  // The engine's reading language follows the setting (lock-screen chapter titles).
  useEffect(() => {
    if (canPlay() && getEngine().getState().readingLang !== reading) getEngine().setReadingLanguage(reading);
  }, [reading]);

  useEffect(() => {
    const prev = document.title;
    document.title = `${shiur.catalog.titleOriginal} · ${tFor(ui)("site.name")}`;
    return () => {
      document.title = prev;
    };
  }, [shiur, ui]);

  const [pane, setPane] = useState<EntityChip | null>(null);
  const mine = state.shiurId === shiur.id;
  const room: RoomContext = {
    ui,
    rt,
    shiur,
    info,
    reading,
    now: mine ? state.t : null,
    playing: mine && (state.status === "playing" || state.status === "loading"),
    start: deep.start ?? 0,
    focusedMoment: deep.momentId,
    skippedKinds: new Set(state.skip.enabled ? state.skip.kinds : []),
    playAt: (t, end) => enginePlayAt(info, t, end),
    playable: hasPlayableAudio(shiur),
    openTopic: setPane,
  };

  const initialTab: TabId = tabForMoment(deep.momentId) ?? availableTabs(room)[0]!;
  const [tab, setTab] = useState<TabId>(initialTab);
  useEffect(() => {
    const t = tabForMoment(deep.momentId);
    if (t) setTab(t);
  }, [deep.momentId]);

  return (
    <article className={s.room} data-room={shiur.id} data-status={shiur.status}>
      <header className={s.header}>
        <Text as="h1" className={s.title} value={shiur.catalog.titleOriginal} shiurLang={shiur.lang} />
        <RoomHeaderDetails room={room} quietOrigin={quietOrigin} />
      </header>
      {mine && state.status === "ended" ? <EndOfShiur room={room} /> : null}
      <div className={s.body}>
        <Chapters room={room} />
        <CompanionTabs room={room} selected={tab} onSelect={setTab} />
      </div>
      <TopicPane room={room} topic={pane} onClose={() => setPane(null)} />
    </article>
  );
}
