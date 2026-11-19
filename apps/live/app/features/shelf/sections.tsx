/**
 * The parts of My Shelf (concept-live §5.8): continue listening, queue, playlists, saved moments,
 * notes, history. Each section renders in full on its own page (`/:ui/shelf/<section>`)
 * and as a short preview (`limit`) on the overview.
 */
import { formatClock, type UiLang } from "@emunas/i18n";
import { useMemo, useState, type FormEvent, type JSX, type ReactNode } from "react";
import { Link } from "react-router";
import type { CorpusRow } from "../../data/index.ts";
import {
  continueListening,
  getPersonal,
  getQueuePlayer,
  peekQueuePlayer,
  playlistPath,
  queueCurrentKey,
  usePersonal,
  useQueuePlayerState,
  type MomentRef,
  type PlaylistRecord,
} from "../../store/index.ts";
import { Button, MomentRow, addToQueue, playAll, playNow, spanLabel } from "./common.tsx";
import type { ShelfT } from "./strings.ts";
import { css } from "./styles.ts";

export const SHELF_SECTIONS = ["continue", "queue", "playlists", "saved", "notes", "history"] as const;
export type ShelfSection = (typeof SHELF_SECTIONS)[number];

export function isShelfSection(v: string | undefined): v is ShelfSection {
  return (SHELF_SECTIONS as readonly string[]).includes(v ?? "");
}

export interface SectionProps {
  ui: UiLang;
  t: ShelfT;
  rows: ReadonlyMap<string, CorpusRow>;
  /** Overview preview: show at most this many entries and no section toolbar. */
  limit?: number;
}

function Empty({ children }: { children: ReactNode }): JSX.Element {
  return <p className={css.empty}>{children}</p>;
}

const refs = (items: readonly MomentRef[]) =>
  items.map((m) => ({ shiurId: m.shiurId, start: m.start, end: m.end, momentId: m.momentId }));

// ---- continue -------------------------------------------------------------------------------------

export function ContinueSection({ ui, t, rows, limit }: SectionProps): JSX.Element {
  const progress = usePersonal((s) => s.progress);
  const items = useMemo(() => continueListening({ progress }, limit ?? 100), [progress, limit]);
  if (items.length === 0) return <Empty>{t("empty.continue")}</Empty>;
  return (
    <ol className={css.list}>
      {items.map((p) => (
        <MomentRow
          key={p.shiurId}
          ui={ui}
          rows={rows}
          shiurId={p.shiurId}
          t={p.t}
          meta={
            <>
              {t("item.progress", { t: formatClock(p.t), duration: formatClock(p.duration) })}
              {p.completedChapters.length > 0 ? ` · ${t("item.chapters", { count: p.completedChapters.length })}` : null}
            </>
          }
        >
          <Button primary onClick={() => void playNow({ shiurId: p.shiurId, start: p.t })}>
            {t("action.resume")}
          </Button>
        </MomentRow>
      ))}
    </ol>
  );
}

// ---- share link -----------------------------------------------------------------------------------

export function ShareLink({ ui, t, items }: { ui: UiLang; t: ShelfT; items: readonly MomentRef[] }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function share(): Promise<void> {
    const href = new URL(playlistPath(ui, items), window.location.href).toString();
    setUrl(href);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
    } catch {
      /* the link is shown for manual copying */
    }
  }
  return (
    <>
      <Button onClick={() => void share()} disabled={items.length === 0}>
        {t("action.share")}
      </Button>
      {url !== null ? (
        <label className={css.field}>
          <span>{t("playlist.linkLabel")}</span>
          <input className={css.input} readOnly value={url} dir="ltr" onFocus={(e) => e.currentTarget.select()} data-testid="share-url" />
          {copied ? (
            <span role="status" className={css.status}>
              {t("playlist.copied")}
            </span>
          ) : null}
        </label>
      ) : null}
    </>
  );
}

// ---- queue ----------------------------------------------------------------------------------------

function SaveAsPlaylist({ t, items, onDone }: { t: ShelfT; items: readonly MomentRef[]; onDone: () => void }): JSX.Element {
  const [name, setName] = useState(() => t("playlist.defaultName", { date: new Date().toISOString().slice(0, 10) }));
  function submit(e: FormEvent): void {
    e.preventDefault();
    if (name.trim() === "") return;
    void getPersonal()
      .createPlaylist(name, refs(items))
      .then(onDone);
  }
  return (
    <form className={css.form} onSubmit={submit}>
      <label className={css.field}>
        <span>{t("playlist.name")}</span>
        <input className={css.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
      </label>
      <Button type="submit" primary>
        {t("action.save")}
      </Button>
      <Button onClick={onDone}>{t("action.cancel")}</Button>
    </form>
  );
}

export function QueueSection({ ui, t, rows, limit }: SectionProps): JSX.Element {
  const queue = usePersonal((s) => s.queue);
  const currentKey = usePersonal(queueCurrentKey);
  const qp = useQueuePlayerState((s) => s, peekQueuePlayer());
  const [saving, setSaving] = useState(false);
  const shown = limit === undefined ? queue : queue.slice(0, limit);
  const p = getPersonal();

  return (
    <>
      {limit === undefined ? (
        <div className={css.toolbar}>
          <Button primary disabled={queue.length === 0} onClick={() => void getQueuePlayer().start()}>
            {t("action.play")}
          </Button>
          <Button disabled={queue.length === 0} onClick={() => void getQueuePlayer().prev()}>
            {t("action.prev")}
          </Button>
          <Button disabled={queue.length === 0} onClick={() => void getQueuePlayer().next()}>
            {t("action.next")}
          </Button>
          <Button disabled={queue.length === 0} onClick={() => setSaving(true)}>
            {t("action.saveAsPlaylist")}
          </Button>
          <ShareLink ui={ui} t={t} items={queue} />
          <Button disabled={queue.length === 0} onClick={() => void p.clearQueue()}>
            {t("action.clearQueue")}
          </Button>
        </div>
      ) : null}
      {saving ? <SaveAsPlaylist t={t} items={queue} onDone={() => setSaving(false)} /> : null}
      {qp.finished ? (
        <p role="status" className={css.status}>
          {t("queue.finished")}
        </p>
      ) : null}
      {queue.length === 0 ? (
        <Empty>{t("empty.queue")}</Empty>
      ) : (
        <ol className={css.list} data-testid="queue-list">
          {shown.map((q, i) => {
            const n = i + 1;
            const playing = qp.activeKey === q.key;
            const failed = qp.failed.includes(q.key);
            const which = t("queue.label", { n });
            return (
              <MomentRow
                key={q.key}
                ui={ui}
                rows={rows}
                shiurId={q.shiurId}
                t={q.start}
                current={playing || (qp.activeKey === null && currentKey === q.key)}
                badge={playing ? t("queue.nowPlaying") : failed ? t("queue.failed") : undefined}
                meta={spanLabel(t, q.start, q.end)}
                testId={`queue-item-${n}`}
              >
                <Button label={`${t("action.play")} · ${which}`} onClick={() => void getQueuePlayer().play(q.key)}>
                  {t("action.play")}
                </Button>
                {limit === undefined ? (
                  <>
                    <Button label={`${t("action.moveUp")} · ${which}`} disabled={i === 0} onClick={() => void p.moveInQueue(q.key, -1)}>
                      ↑
                    </Button>
                    <Button
                      label={`${t("action.moveDown")} · ${which}`}
                      disabled={i === queue.length - 1}
                      onClick={() => void p.moveInQueue(q.key, 1)}
                    >
                      ↓
                    </Button>
                    <Button label={`${t("action.remove")} · ${which}`} onClick={() => void p.removeFromQueue(q.key)}>
                      {t("action.remove")}
                    </Button>
                  </>
                ) : null}
              </MomentRow>
            );
          })}
        </ol>
      )}
    </>
  );
}

// ---- playlists ------------------------------------------------------------------------------------

function PlaylistActions({ ui, t, pl }: { ui: UiLang; t: ShelfT; pl: PlaylistRecord }): JSX.Element {
  return (
    <>
      <Button primary disabled={pl.items.length === 0} label={`${t("action.playAll")} · ${pl.name}`} onClick={() => void playAll(refs(pl.items))}>
        {t("action.playAll")}
      </Button>
      <Button disabled={pl.items.length === 0} label={`${t("action.addToQueue")} · ${pl.name}`} onClick={() => void addToQueue(refs(pl.items))}>
        {t("action.addToQueue")}
      </Button>
      <ShareLink ui={ui} t={t} items={pl.items} />
    </>
  );
}

export function PlaylistsSection({ ui, t, limit }: SectionProps): JSX.Element {
  const playlists = usePersonal((s) => s.playlists);
  const shown = limit === undefined ? playlists : playlists.slice(0, limit);
  if (playlists.length === 0) return <Empty>{t("empty.playlists")}</Empty>;
  return (
    <ul className={css.list}>
      {shown.map((pl) => (
        <li key={pl.id} className={css.item}>
          <div className={css.itemMain}>
            <Link className={css.itemTitle} to={`/${ui}/shelf/playlists?id=${encodeURIComponent(pl.id)}`}>
              <bdi>{pl.name}</bdi>
            </Link>
            <span className={css.itemMeta}>{t("item.count", { count: pl.items.length })}</span>
          </div>
          {limit === undefined ? (
            <div className={css.actions}>
              <PlaylistActions ui={ui} t={t} pl={pl} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PlaylistDetail({ ui, t, rows, id }: SectionProps & { id: string }): JSX.Element {
  const pl = usePersonal((s) => s.playlists.find((p) => p.id === id));
  const status = usePersonal((s) => s.status);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const p = getPersonal();
  if (!pl) return <Empty>{status === "ready" ? t("playlist.notFound") : t("shelf.loading")}</Empty>;

  function rename(e: FormEvent): void {
    e.preventDefault();
    if (name.trim() === "") return;
    void p.renamePlaylist(id, name).then(() => setRenaming(false));
  }
  function remove(): void {
    if (window.confirm(t("playlist.deleteConfirm", { name: pl!.name }))) void p.deletePlaylist(id);
  }

  return (
    <section aria-labelledby="playlist-name">
      <h2 id="playlist-name" className={css.sectionTitle}>
        <bdi>{pl.name}</bdi>
      </h2>
      <div className={css.toolbar}>
        <PlaylistActions ui={ui} t={t} pl={pl} />
        <Button
          onClick={() => {
            setName(pl.name);
            setRenaming(true);
          }}
        >
          {t("action.rename")}
        </Button>
        <Button onClick={remove}>{t("action.delete")}</Button>
      </div>
      {renaming ? (
        <form className={css.form} onSubmit={rename}>
          <label className={css.field}>
            <span>{t("playlist.name")}</span>
            <input className={css.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
          </label>
          <Button type="submit" primary>
            {t("action.save")}
          </Button>
          <Button onClick={() => setRenaming(false)}>{t("action.cancel")}</Button>
        </form>
      ) : null}
      {pl.items.length === 0 ? (
        <Empty>{t("empty.queue")}</Empty>
      ) : (
        <ol className={css.list}>
          {pl.items.map((m, i) => {
            const which = t("queue.label", { n: i + 1 });
            return (
              <MomentRow key={`${i}-${m.shiurId}-${m.start}`} ui={ui} rows={rows} shiurId={m.shiurId} t={m.start} meta={spanLabel(t, m.start, m.end)}>
                <Button label={`${t("action.play")} · ${which}`} onClick={() => void playNow(m)}>
                  {t("action.play")}
                </Button>
                <Button label={`${t("action.remove")} · ${which}`} onClick={() => void p.removeFromPlaylist(id, i)}>
                  {t("action.remove")}
                </Button>
              </MomentRow>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ---- saved moments --------------------------------------------------------------------------------

export function SavedSection({ ui, t, rows, limit }: SectionProps): JSX.Element {
  const saved = usePersonal((s) => s.saved);
  const shown = limit === undefined ? saved : saved.slice(0, limit);
  if (saved.length === 0) return <Empty>{t("empty.saved")}</Empty>;
  return (
    <ol className={css.list}>
      {shown.map((s, i) => {
        const which = t("queue.label", { n: i + 1 });
        const m = { shiurId: s.shiurId, start: s.t, end: s.end, momentId: s.momentId };
        return (
          <MomentRow key={s.id} ui={ui} rows={rows} shiurId={s.shiurId} t={s.t} meta={spanLabel(t, s.t, s.end)}>
            <Button primary label={`${t("action.play")} · ${which}`} onClick={() => void playNow(m)}>
              {t("action.play")}
            </Button>
            {limit === undefined ? (
              <>
                <Button label={`${t("action.addToQueue")} · ${which}`} onClick={() => void addToQueue([m])}>
                  {t("action.addToQueue")}
                </Button>
                <Button label={`${t("action.remove")} · ${which}`} onClick={() => void getPersonal().unsave(s.id)}>
                  {t("action.remove")}
                </Button>
              </>
            ) : null}
          </MomentRow>
        );
      })}
    </ol>
  );
}

// ---- notes ----------------------------------------------------------------------------------------

function NoteEditor({ t, id, text, onDone }: { t: ShelfT; id: string; text: string; onDone: () => void }): JSX.Element {
  const [value, setValue] = useState(text);
  return (
    <form
      className={css.form}
      onSubmit={(e) => {
        e.preventDefault();
        void getPersonal()
          .editNote(id, value)
          .then(onDone);
      }}
    >
      <label className={css.field}>
        <span>{t("note.label")}</span>
        <textarea className={css.textarea} value={value} onChange={(e) => setValue(e.target.value)} maxLength={5000} dir="auto" />
      </label>
      <Button type="submit" primary>
        {t("action.save")}
      </Button>
      <Button onClick={onDone}>{t("action.cancel")}</Button>
    </form>
  );
}

export function NotesSection({ ui, t, rows, limit }: SectionProps): JSX.Element {
  const notes = usePersonal((s) => s.notes);
  const [editing, setEditing] = useState<string | null>(null);
  const shown = limit === undefined ? notes : notes.slice(0, limit);
  if (notes.length === 0) return <Empty>{t("empty.notes")}</Empty>;
  return (
    <ol className={css.list}>
      {shown.map((n, i) => {
        const which = t("queue.label", { n: i + 1 });
        return (
          <MomentRow
            key={n.id}
            ui={ui}
            rows={rows}
            shiurId={n.shiurId}
            t={n.t}
            meta={
              <>
                {t("item.at", { t: formatClock(n.t) })}
                {editing === n.id ? null : (
                  <span className={css.noteText} dir="auto">
                    {" · "}
                    {n.text}
                  </span>
                )}
              </>
            }
          >
            {editing === n.id ? (
              <NoteEditor t={t} id={n.id} text={n.text} onDone={() => setEditing(null)} />
            ) : (
              <>
                <Button label={`${t("action.play")} · ${which}`} onClick={() => void playNow({ shiurId: n.shiurId, start: n.t })}>
                  {t("action.play")}
                </Button>
                {limit === undefined ? (
                  <>
                    <Button label={`${t("action.edit")} · ${which}`} onClick={() => setEditing(n.id)}>
                      {t("action.edit")}
                    </Button>
                    <Button label={`${t("action.delete")} · ${which}`} onClick={() => void getPersonal().deleteNote(n.id)}>
                      {t("action.delete")}
                    </Button>
                  </>
                ) : null}
              </>
            )}
          </MomentRow>
        );
      })}
    </ol>
  );
}

// ---- history --------------------------------------------------------------------------------------

export function HistorySection({ ui, t, rows, limit }: SectionProps): JSX.Element {
  const history = usePersonal((s) => s.history);
  const progress = usePersonal((s) => s.progress);
  const shown = limit === undefined ? history : history.slice(0, limit);
  if (history.length === 0) return <Empty>{t("empty.history")}</Empty>;
  return (
    <>
      {limit === undefined ? (
        <div className={css.toolbar}>
          <Button onClick={() => void getPersonal().clearHistory()}>{t("action.clearHistory")}</Button>
        </div>
      ) : null}
      <ol className={css.list}>
        {shown.map((h, i) => {
          const p = progress[h.shiurId];
          const which = t("queue.label", { n: i + 1 });
          return (
            <MomentRow
              key={h.shiurId}
              ui={ui}
              rows={rows}
              shiurId={h.shiurId}
              t={h.t}
              meta={
                <>
                  <time dateTime={new Date(h.lastPlayedAt).toISOString()}>{new Date(h.lastPlayedAt).toLocaleDateString(ui)}</time>
                  {p ? ` · ${t("item.progress", { t: formatClock(p.t), duration: formatClock(p.duration) })}` : null}
                </>
              }
            >
              <Button label={`${t("action.resume")} · ${which}`} onClick={() => void playNow({ shiurId: h.shiurId, start: h.t })}>
                {t("action.resume")}
              </Button>
              {limit === undefined ? (
                <Button label={`${t("action.remove")} · ${which}`} onClick={() => void getPersonal().removeHistory(h.shiurId)}>
                  {t("action.remove")}
                </Button>
              ) : null}
            </MomentRow>
          );
        })}
      </ol>
    </>
  );
}

export const SECTION_COMPONENTS: Readonly<Record<ShelfSection, (p: SectionProps) => JSX.Element>> = {
  continue: ContinueSection,
  queue: QueueSection,
  playlists: PlaylistsSection,
  saved: SavedSection,
  notes: NotesSection,
  history: HistorySection,
};
