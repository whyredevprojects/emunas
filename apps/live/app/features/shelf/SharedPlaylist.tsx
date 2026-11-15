/**
 * `/:ui/pl#<base64url(JSON [shiurId, t, end?][])>`: a playlist someone shared (tech-live §4.2). The
 * list is decoded in the browser from the fragment (never sent to a server). Nothing is stored until
 * the listener plays it (it becomes the queue), adds it to the queue, or saves it as a playlist.
 */
import type { UiLang } from "@emunas/i18n";
import { useMemo, useState, type FormEvent, type JSX } from "react";
import { useLocation } from "react-router";
import { decodePlaylist, getPersonal } from "../../store/index.ts";
import { Button, MomentRow, addToQueue, playAll, playNow, spanLabel, useCorpusRows } from "./common.tsx";
import type { ShelfT } from "./strings.ts";
import { css } from "./styles.ts";

export function SharedPlaylist({ ui, t }: { ui: UiLang; t: ShelfT }): JSX.Element {
  const { hash } = useLocation();
  const items = useMemo(() => decodePlaylist(hash), [hash]);
  const rows = useCorpusRows();
  const [name, setName] = useState(() => t("pl.sharedName"));
  const [saved, setSaved] = useState(false);

  function save(e: FormEvent): void {
    e.preventDefault();
    if (!items || name.trim() === "") return;
    void getPersonal()
      .createPlaylist(name, items)
      .then(() => setSaved(true));
  }

  return (
    <article className={css.page}>
      <h1 className={css.title}>{t("pl.title")}</h1>
      {items === null ? (
        <p className={css.lead}>{t("pl.invalid")}</p>
      ) : (
        <>
          <p className={css.lead}>{t("pl.lead")}</p>
          <div className={css.toolbar}>
            <Button primary onClick={() => void playAll(items)}>
              {t("action.playAll")}
            </Button>
            <Button onClick={() => void addToQueue(items)}>{t("action.addToQueue")}</Button>
          </div>
          <form className={css.form} onSubmit={save}>
            <label className={css.field}>
              <span>{t("playlist.name")}</span>
              <input className={css.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
            </label>
            <Button type="submit">{t("action.saveAsPlaylist")}</Button>
          </form>
          {saved ? (
            <p role="status" className={css.status}>
              {t("pl.saved")}
            </p>
          ) : null}
          <ol className={css.list} data-testid="shared-list">
            {items.map((m, i) => {
              const which = t("queue.label", { n: i + 1 });
              return (
                <MomentRow key={`${i}-${m.shiurId}-${m.start}`} ui={ui} rows={rows} shiurId={m.shiurId} t={m.start} meta={spanLabel(t, m.start, m.end)}>
                  <Button label={`${t("action.play")} · ${which}`} onClick={() => void playNow(m)}>
                    {t("action.play")}
                  </Button>
                </MomentRow>
              );
            })}
          </ol>
        </>
      )}
    </article>
  );
}
