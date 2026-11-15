/**
 * "Download for offline" control for one shiur (tech-live §4.5). Shows the state kept in the personal
 * store (`downloads`, W3.9) and the progress of a running download; renders nothing when the shiur
 * has no playable recording (`playable: false` recordings cannot be downloaded) or the browser has no
 * Cache Storage / service worker support, and nothing during prerender.
 */
import type { UiLang } from "@emunas/i18n";
import { useEffect, useState, useSyncExternalStore, type JSX } from "react";
import type { ShiurFile } from "../../app/data/types.ts";
import { usePersonal } from "../../app/store/personal.ts";
import {
  DownloadError,
  cancelDownload,
  downloadShiur,
  planDownload,
  removeShiurDownload,
  runningDownloads,
  subscribeDownloads,
  type DownloadErrorCode,
} from "./downloads.ts";
import { offlineT } from "./strings.ts";

const EMPTY = new Map();

function supported(): boolean {
  return typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator;
}

export function DownloadButton({
  shiur,
  ui,
  className,
}: {
  shiur: ShiurFile;
  ui: UiLang;
  /** Class for the buttons (the room passes its link-button style). */
  className?: string;
}): JSX.Element | null {
  const t = offlineT(ui);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const record = usePersonal((s) => s.downloads[shiur.id] ?? null);
  const progress = useSyncExternalStore(subscribeDownloads, runningDownloads, () => EMPTY).get(shiur.id) ?? null;
  const [error, setError] = useState<DownloadErrorCode | null>(null);

  if (!mounted || !supported() || planDownload(shiur) === null) return null;

  const start = () => {
    setError(null);
    downloadShiur(shiur).catch((e: unknown) => setError(e instanceof DownloadError ? e.code : "network"));
  };
  const remove = () => {
    setError(null);
    void removeShiurDownload(shiur.id, shiur);
  };

  let status: string | null = null;
  let button: JSX.Element;
  if (progress) {
    status =
      progress.total !== null && progress.total > 0
        ? t("offline.downloading", { percent: Math.min(99, Math.floor((progress.bytes / progress.total) * 100)) })
        : t("offline.downloadingUnknown", { mb: (progress.bytes / 1_048_576).toFixed(1) });
    button = (
      <button type="button" className={className} onClick={() => cancelDownload(shiur.id)} data-offline="cancel">
        {t("offline.cancel")}
      </button>
    );
  } else if (record?.state === "complete") {
    status = t("offline.downloaded");
    button = (
      <button type="button" className={className} onClick={remove} data-offline="remove">
        {t("offline.remove")}
      </button>
    );
  } else if (record?.state === "partial") {
    status = t("offline.partial");
    button = (
      <button type="button" className={className} onClick={start} data-offline="resume">
        {t("offline.resume")}
      </button>
    );
  } else {
    button = (
      <button type="button" className={className} onClick={start} data-offline="download">
        {t("offline.download")}
      </button>
    );
  }

  return (
    <span data-offline-control="">
      {button}
      <span role="status" aria-live="polite" data-offline-status={record?.state ?? (progress ? "running" : "none")}>
        {status ? ` ${status}` : null}
        {error ? ` ${t(`offline.error.${error}`)}` : null}
      </span>
    </span>
  );
}
