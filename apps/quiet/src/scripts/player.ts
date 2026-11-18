/**
 * The Quiet player (tech-quiet §7; integration-plan W3.2). Progressive enhancement over a page
 * that already works: without this script every recording is a native `<audio controls>` and every
 * time is a link to `audioUrl#t=<local seconds>` (Amendment A1: the media host, no site route).
 *
 * With it:
 * - one controller per page; the playing `<audio>` docks (sticky) once playback starts;
 * - a delegated click on a time link (`a.time[data-g]`, or a shell `TimeLink`'s `a[data-rec][data-t]`)
 *   seeks that recording instead of navigating, and
 *   records the place as `#t=<global seconds>` in the address;
 * - `#t=<global seconds>` in the address on load (and on `hashchange`) seeks there (no autoplay);
 * - the margin mark: every `[data-marks]` group's items (`[data-mark]`, start in their `.time`'s
 *   `data-g`) are binary-searched at most 4 times a second and the current one gets
 *   `aria-current="time"` on its time. No auto-scroll, no sweeping highlight;
 * - Media Session metadata and actions (play/pause, ±seek, seek-to, previous/next chapter);
 * - multi-recording shiurim: when one recording ends the next playable one starts;
 * - keyboard (Space/K play-pause, ←/→ ±10 s) only while the dock itself has focus, never global;
 * - improved audio (docs/sites/cleaned-audio-ux.md §6): the line under the tracks
 *   (`p.listen-version`) gets a real button that switches every `<audio>` between the copy with the
 *   sound improved by AI (`data-cleaned`, the default) and the original (`data-original`), keeping
 *   position, play/pause and speed, and announces the switch politely. The choice is one global
 *   preference in localStorage (`AUDIO_VERSION_KEY`, written only on a click). An `error` on an
 *   improved file falls back once to the original for that recording. Downloads stay the original.
 *
 * No dependencies beyond the shared vocabulary, no network of its own; its only storage is that one
 * preference. Budget ≤ 6 KB brotli (checked in tests).
 */
import { AUDIO_VERSION_KEY, parseAudioVersion, type AudioVersion } from "@emunas/i18n";

/** Seconds from a page hash `#t=754` / `#t=754.5`; null for anything else. */
export function parseTimeHash(hash: string): number | null {
  const m = /^#t=(\d{1,7}(?:\.\d+)?)$/.exec(hash);
  return m ? Number(m[1]) : null;
}

/**
 * The page hash for global seconds, fractional kept to the millisecond (`#t=582.12`, `#t=754`), so
 * a reload or a shared address seeks to the same place the link did.
 */
export function timeHash(g: number): string {
  const t = Number.isFinite(g) ? Math.max(0, Math.round(g * 1000) / 1000) : 0;
  return `#t=${t}`;
}

/**
 * Index of the last start ≤ `now` in ascending `starts` (binary search), or -1 when `now` is
 * before the first start.
 */
export function currentIndex(starts: readonly number[], now: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((starts[mid] as number) <= now) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Seconds of slack for the margin mark. A media element reports the position it could seek to, which
 * for mp3 can sit a frame (~26 ms) before the time asked for; without slack a seek to an item that
 * starts at 582.12 would mark the item before it.
 */
export const MARK_SLACK = 0.05;

/** The item the margin mark sits on at `now`: `currentIndex` with `MARK_SLACK`. */
export function markIndex(starts: readonly number[], now: number): number {
  return currentIndex(starts, now + MARK_SLACK);
}

/** Previous-chapter rule: restart the current chapter if more than 3 s into it, else go back one. */
export function previousStart(starts: readonly number[], now: number): number {
  const i = currentIndex(starts, now);
  if (i < 0) return 0;
  if (now - (starts[i] as number) > 3 || i === 0) return starts[i] as number;
  return starts[i - 1] as number;
}

interface MarkGroup {
  starts: number[];
  els: Element[];
  cur: number;
}

export interface Player {
  /** Global seconds of the playing position. */
  now(): number;
  /** Seek to global seconds; optionally start playing. */
  seekGlobal(g: number, play: boolean): void;
  readonly audios: readonly HTMLAudioElement[];
}

const MARK_INTERVAL_MS = 250;
const STEP = 10;

export function initPlayer(doc: Document, win: Window): Player | null {
  const audios = Array.from(doc.querySelectorAll<HTMLAudioElement>("audio.listen-audio[data-rec]"));
  const first = audios[0];
  if (!first) return null;
  const dock = first.closest<HTMLElement>(".listen");
  const article = doc.querySelector<HTMLElement>("[data-player-title]");
  const nav = win.navigator;
  const session = "mediaSession" in nav ? nav.mediaSession : null;
  const offset = (a: HTMLAudioElement) => Number(a.dataset["offset"]) || 0;
  let current = first;

  const groups: MarkGroup[] = Array.from(doc.querySelectorAll("[data-marks]")).map((g) => {
    const items = Array.from(g.querySelectorAll("[data-mark]"))
      .map((el) => el.querySelector<HTMLElement>(".time[data-g]"))
      .filter((el): el is HTMLElement => el !== null)
      .map((el) => ({ t: Number(el.dataset["g"]), el }))
      .filter((x) => Number.isFinite(x.t))
      .sort((a, b) => a.t - b.t);
    return { starts: items.map((x) => x.t), els: items.map((x) => x.el), cur: -1 };
  });

  // A seek into a recording whose metadata has not loaded waits for `loadedmetadata`; until then its
  // target stands in for `currentTime` (still 0), so `play` and `timeupdate` keep the mark on the
  // clicked item instead of moving it to the first one.
  const pending = new Map<HTMLAudioElement, number>();
  const now = () => offset(current) + (pending.get(current) ?? (current.currentTime || 0));

  function mark(g: number): void {
    for (const group of groups) {
      const i = markIndex(group.starts, g);
      if (i === group.cur) continue;
      group.els[group.cur]?.removeAttribute("aria-current");
      group.els[i]?.setAttribute("aria-current", "time");
      group.cur = i;
    }
  }

  function setCurrent(a: HTMLAudioElement): void {
    if (a !== current && !current.paused) current.pause();
    current = a;
    for (const x of audios) x.closest(".track")?.toggleAttribute("data-current", x === a);
    render();
  }

  function docked(): void {
    if (!dock || dock.hasAttribute("data-docked")) return;
    dock.setAttribute("data-docked", "");
    dock.tabIndex = 0;
    render();
  }

  // Improved audio. `failed`: recordings whose improved file would not load (rule 8).
  let version: AudioVersion;
  try {
    version = parseAudioVersion(win.localStorage.getItem(AUDIO_VERSION_KEY));
  } catch {
    version = parseAudioVersion(null);
  }
  const failed = new Set<HTMLAudioElement>();
  const line = dock?.querySelector<HTMLElement>(".listen-version") ?? null;
  const status = line?.querySelector<HTMLElement>("[role=status]");
  const lineText = line?.querySelector("span");
  let button: HTMLButtonElement | undefined;
  const urlOf = (a: HTMLAudioElement) => {
    const d = a.dataset;
    return (version === "cleaned" && !failed.has(a) && d["cleaned"]) || d["original"] || "";
  };
  /** Whether `a` plays (or would play) its improved copy; null when it has none. */
  const improved = (a: HTMLAudioElement) => (a.dataset["cleaned"] ? urlOf(a) === a.dataset["cleaned"] : null);

  function render(): void {
    if (!line || !button || !lineText) return;
    const on = improved(current);
    const state = (on ?? version === "cleaned") ? "Cleaned" : "Original";
    lineText.textContent = line.dataset[`text${state}`] ?? "";
    button.textContent = line.dataset[`action${state}`] ?? "";
    // Docked, the line describes the current part: hidden while it has no improved copy.
    line.hidden = on === null && dock?.hasAttribute("data-docked") === true;
  }

  /** Points `a` at the version it should play, carrying position, play state and speed. */
  function apply(a: HTMLAudioElement): void {
    const url = urlOf(a);
    if (a.getAttribute("src") === url) return;
    const idle = a.readyState === 0 && a.paused && !pending.has(a);
    const local = pending.get(a) ?? (a.currentTime || 0);
    const playing = !a.paused;
    const rate = a.playbackRate;
    a.defaultPlaybackRate = rate;
    a.src = url;
    if (idle || a !== current) return;
    seek(a, local, playing);
    a.playbackRate = rate;
  }

  const link = line?.querySelector<HTMLAnchorElement>("a.listen-version-switch");
  if (line && link) {
    button = doc.createElement("button");
    button.type = "button";
    button.className = link.className;
    button.setAttribute("aria-describedby", link.getAttribute("aria-describedby") ?? "");
    link.replaceWith(button);
    button.addEventListener("click", () => {
      const next: AudioVersion = (improved(current) ?? version === "cleaned") ? "original" : "cleaned";
      version = next;
      if (next === "cleaned") failed.clear();
      try {
        win.localStorage.setItem(AUDIO_VERSION_KEY, next);
      } catch {
        /* storage blocked: the choice lasts for this page */
      }
      audios.forEach(apply);
      render();
      if (status) {
        status.textContent = "";
        const say = line.dataset[next === "cleaned" ? "announceCleaned" : "announceOriginal"] ?? "";
        win.setTimeout(() => (status.textContent = say), 50);
      }
    });
  }
  audios.forEach(apply);
  render();

  function seek(a: HTMLAudioElement, local: number, play: boolean): void {
    setCurrent(a);
    const t = Math.max(0, local);
    if (a.readyState >= 1) {
      pending.delete(a);
      a.currentTime = t;
    } else {
      if (!pending.has(a)) {
        a.addEventListener(
          "loadedmetadata",
          () => {
            a.currentTime = pending.get(a) ?? 0;
            pending.delete(a);
          },
          { once: true },
        );
      }
      pending.set(a, t);
      if (!play) {
        a.preload = "metadata";
        a.load();
      }
    }
    mark(offset(a) + t);
    if (play) {
      docked();
      a.play().catch(() => undefined);
    }
  }

  /** The playable recording a global time falls in (the last one starting at or before it). */
  function audioAt(g: number): HTMLAudioElement {
    let found = first as HTMLAudioElement;
    for (const a of audios) if (offset(a) <= g) found = a;
    return found;
  }

  function seekGlobal(g: number, play: boolean): void {
    const a = audioAt(g);
    seek(a, g - offset(a), play);
  }

  function setHash(g: number): void {
    try {
      win.history.replaceState(win.history.state, "", timeHash(g));
    } catch {
      /* a sandboxed or file: page: the seek still works */
    }
  }

  doc.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a.time[data-g], a[data-rec][data-t]");
    if (!link) return;
    const d = link.dataset;
    const g = Number(d["g"]);
    // `TimeLink` names the recording; the page's compact links carry only global seconds.
    const a = d["rec"] ? audios.find((x) => x.dataset["rec"] === d["rec"]) : Number.isFinite(g) ? audioAt(g) : undefined;
    if (!a) return;
    e.preventDefault();
    // Seek to the exact global time (fractional), so playback and the mark land on the item that
    // was clicked, not the second before it. `data-t` (also fractional) is the fallback.
    const local = Number.isFinite(g) ? g - offset(a) : Number(d["t"]) || 0;
    seek(a, local, true);
    setHash(offset(a) + local);
  });

  const fromHash = () => {
    const g = parseTimeHash(win.location.hash);
    if (g !== null) seekGlobal(g, false);
  };
  win.addEventListener("hashchange", fromHash);
  fromHash();

  let last = 0;
  const chapterStarts = () => groups[0]?.starts ?? [];

  function position(a: HTMLAudioElement): void {
    if (!session?.setPositionState || !Number.isFinite(a.duration)) return;
    try {
      session.setPositionState({ duration: a.duration, playbackRate: a.playbackRate, position: Math.min(a.currentTime, a.duration) });
    } catch {
      /* inconsistent state while seeking: the next update fixes it */
    }
  }

  audios.forEach((a, i) => {
    a.addEventListener("play", () => {
      setCurrent(a);
      docked();
      mark(now());
      if (session) {
        session.playbackState = "playing";
        if (article && typeof MediaMetadata === "function") {
          const d = article.dataset;
          const part = audios.length > 1 ? ` (${i + 1}/${audios.length})` : "";
          session.metadata = new MediaMetadata({
            title: (d["playerTitle"] ?? "") + part,
            artist: d["playerArtist"] ?? "",
            album: d["playerAlbum"] ?? "",
          });
        }
      }
    });
    a.addEventListener("pause", () => {
      if (session && a === current) session.playbackState = "paused";
    });
    a.addEventListener("timeupdate", () => {
      if (a !== current) return;
      const t = Date.now();
      if (t - last < MARK_INTERVAL_MS) return;
      last = t;
      mark(now());
      position(a);
    });
    a.addEventListener("seeked", () => {
      if (a === current) mark(now());
    });
    a.addEventListener("error", () => {
      const d = a.dataset["cleaned"];
      if (!d || failed.has(a) || a.getAttribute("src") !== d) return;
      failed.add(a);
      apply(a);
      render();
    });
    a.addEventListener("ended", () => {
      const next = audios[i + 1];
      if (a === current && next) seek(next, 0, true);
    });
  });

  const by = (delta: number) => {
    const a = current;
    a.currentTime = Math.max(0, Math.min((a.currentTime || 0) + delta, Number.isFinite(a.duration) ? a.duration : Infinity));
    mark(now());
  };
  const toggle = () => (current.paused ? current.play().catch(() => undefined) : current.pause());

  if (session) {
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void current.play().catch(() => undefined)],
      ["pause", () => current.pause()],
      ["seekbackward", (d) => by(-(d.seekOffset ?? STEP))],
      ["seekforward", (d) => by(d.seekOffset ?? STEP)],
      ["seekto", (d) => d.seekTime !== undefined && seek(current, d.seekTime, !current.paused)],
      ["previoustrack", () => seekGlobal(previousStart(chapterStarts(), now()), true)],
      [
        "nexttrack",
        () => {
          const starts = chapterStarts();
          const next = starts[currentIndex(starts, now()) + 1];
          if (next !== undefined) seekGlobal(next, true);
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        /* action not supported by this browser */
      }
    }
  }

  dock?.addEventListener("keydown", (e) => {
    if (e.target !== dock || !dock.hasAttribute("data-docked") || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === " " || k === "k" || k === "K") toggle();
    else if (k === "ArrowLeft") by(-STEP);
    else if (k === "ArrowRight") by(STEP);
    else return;
    e.preventDefault();
  });

  return { now, seekGlobal, audios };
}
