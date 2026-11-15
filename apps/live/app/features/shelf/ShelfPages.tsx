/**
 * My Shelf pages: the overview (`/:ui/shelf`) and one section in full (`/:ui/shelf/:section`, with
 * `?id=` selecting a playlist under `playlists`). Data is local (IndexedDB or, when storage is
 * blocked, memory for this tab); the pages say which.
 */
import type { UiLang } from "@emunas/i18n";
import { useId, type JSX } from "react";
import { Link } from "react-router";
import { usePersonal, type PersonalState } from "../../store/index.ts";
import { useCorpusRows } from "./common.tsx";
import { PlaylistDetail, SECTION_COMPONENTS, SHELF_SECTIONS, type ShelfSection } from "./sections.tsx";
import type { ShelfKey, ShelfT } from "./strings.ts";
import { css } from "./styles.ts";
import { TransferPanel } from "./TransferPanel.tsx";

const SECTION_TITLE: Readonly<Record<ShelfSection, ShelfKey>> = {
  continue: "section.continue",
  queue: "section.queue",
  playlists: "section.playlists",
  saved: "section.saved",
  notes: "section.notes",
  history: "section.history",
  downloads: "section.downloads",
};

export function sectionTitleKey(s: ShelfSection): ShelfKey {
  return SECTION_TITLE[s];
}

function sectionCount(s: PersonalState, section: ShelfSection): number {
  switch (section) {
    case "continue":
      return Object.values(s.progress).filter((p) => p.completedAt === null && p.t >= 30).length;
    case "queue":
      return s.queue.length;
    case "playlists":
      return s.playlists.length;
    case "saved":
      return s.saved.length;
    case "notes":
      return s.notes.length;
    case "history":
      return s.history.length;
    case "downloads":
      return Object.keys(s.downloads).length;
  }
}

/** Shown while the shelf loads, and when storage is unavailable. */
function StorageState({ t }: { t: ShelfT }): JSX.Element | null {
  const status = usePersonal((s) => s.status);
  const persistent = usePersonal((s) => s.persistent);
  if (status !== "ready") return <p className={css.empty}>{t("shelf.loading")}</p>;
  if (!persistent) {
    return (
      <p className={css.notice} role="note" data-testid="storage-notice">
        {t("shelf.memoryNotice")}
      </p>
    );
  }
  return null;
}

const PREVIEW = 3;

function OverviewSection({ ui, t, section, rows }: { ui: UiLang; t: ShelfT; section: ShelfSection; rows: ReturnType<typeof useCorpusRows> }) {
  const headingId = useId();
  const count = usePersonal((s) => sectionCount(s, section));
  const Section = SECTION_COMPONENTS[section];
  return (
    <section className={css.section} aria-labelledby={headingId} data-section={section}>
      <div className={css.sectionHead}>
        <h2 id={headingId} className={css.sectionTitle}>
          <Link to={`/${ui}/shelf/${section}`}>{t(SECTION_TITLE[section])}</Link>
        </h2>
        {count > PREVIEW ? <Link to={`/${ui}/shelf/${section}`}>{t("shelf.seeAll", { count })}</Link> : null}
      </div>
      <Section ui={ui} t={t} rows={rows} limit={PREVIEW} />
    </section>
  );
}

export function ShelfOverview({ ui, t }: { ui: UiLang; t: ShelfT }): JSX.Element {
  const rows = useCorpusRows();
  return (
    <article className={css.page}>
      <h1 className={css.title}>{t("shelf.title")}</h1>
      <p className={css.lead}>{t("shelf.lead")}</p>
      <StorageState t={t} />
      {SHELF_SECTIONS.map((s) => (
        <OverviewSection key={s} ui={ui} t={t} section={s} rows={rows} />
      ))}
      <TransferPanel t={t} />
    </article>
  );
}

export function ShelfSectionPage({
  ui,
  t,
  section,
  playlistId,
}: {
  ui: UiLang;
  t: ShelfT;
  section: ShelfSection | null;
  playlistId: string | null;
}): JSX.Element {
  const rows = useCorpusRows();
  const back = (
    <Link className={css.back} to={`/${ui}/shelf`}>
      {t("shelf.back")}
    </Link>
  );
  if (section === null) {
    return (
      <article className={css.page}>
        {back}
        <h1 className={css.title}>{t("shelf.title")}</h1>
        <p className={css.lead}>{t("shelf.unknownSection")}</p>
      </article>
    );
  }
  const Section = SECTION_COMPONENTS[section];
  return (
    <article className={css.page}>
      {back}
      <h1 className={css.title}>{t(SECTION_TITLE[section])}</h1>
      <StorageState t={t} />
      {section === "playlists" && playlistId !== null ? (
        <PlaylistDetail ui={ui} t={t} rows={rows} id={playlistId} />
      ) : (
        <Section ui={ui} t={t} rows={rows} />
      )}
    </article>
  );
}
