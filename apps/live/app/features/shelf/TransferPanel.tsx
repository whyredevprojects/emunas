/**
 * Export / import of the whole shelf as a JSON file (tech-live §4.2), and erasing it. The file is the
 * listener's own data; it is read only in the browser and never uploaded.
 */
import { useId, useState, type ChangeEvent, type JSX } from "react";
import { ImportError, exportFileName, getPersonal, serializeExport, type ImportMode } from "../../store/index.ts";
import { Button } from "./common.tsx";
import type { ShelfT } from "./strings.ts";
import { css } from "./styles.ts";

type Status = { kind: "ok"; accepted: number; skipped: number } | { kind: "error"; message: string } | null;

function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function TransferPanel({ t }: { t: ShelfT }): JSX.Element {
  const [mode, setMode] = useState<ImportMode>("merge");
  const [status, setStatus] = useState<Status>(null);
  const headingId = useId();
  const fileId = useId();

  async function onExport(): Promise<void> {
    const file = await getPersonal().exportFile();
    download(serializeExport(file), exportFileName(Date.now()));
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const r = await getPersonal().importText(text, mode);
      setStatus({ kind: "ok", accepted: r.accepted, skipped: r.skipped });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof ImportError ? t(`transfer.error.${err.code}`) : t("transfer.error.read"),
      });
    } finally {
      input.value = "";
    }
  }

  function onErase(): void {
    if (window.confirm(t("transfer.eraseConfirm"))) void getPersonal().clearAll();
  }

  return (
    <section className={css.section} aria-labelledby={headingId}>
      <div className={css.sectionHead}>
        <h2 id={headingId} className={css.sectionTitle}>
          {t("transfer.title")}
        </h2>
      </div>
      <p>{t("transfer.lead")}</p>
      <div className={css.toolbar}>
        <Button primary onClick={() => void onExport()}>
          {t("transfer.export")}
        </Button>
      </div>
      <fieldset className={css.fieldset}>
        <legend>{t("transfer.mode")}</legend>
        {(["merge", "replace"] as const).map((m) => (
          <label key={m} className={css.radio}>
            <input type="radio" name="import-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
            {t(m === "merge" ? "transfer.merge" : "transfer.replace")}
          </label>
        ))}
      </fieldset>
      <div className={css.field}>
        <label htmlFor={fileId}>{t("transfer.import")}</label>
        <input id={fileId} type="file" accept="application/json,.json" onChange={(e) => void onImport(e)} data-testid="import-file" />
      </div>
      <div role="status" className={css.status}>
        {status?.kind === "ok" ? (
          <>
            {t("transfer.done", { count: status.accepted })}
            {status.skipped > 0 ? ` ${t("transfer.skipped", { count: status.skipped })}` : null}
          </>
        ) : status?.kind === "error" ? (
          status.message
        ) : null}
      </div>
      <div className={css.toolbar}>
        <Button onClick={onErase}>{t("transfer.erase")}</Button>
      </div>
    </section>
  );
}
