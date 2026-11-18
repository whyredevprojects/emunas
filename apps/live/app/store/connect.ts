/**
 * Wires the personal store into the rest of the app, once per page load (integration of W3.7,
 * W3.8 and W3.9):
 * - every playback through the shared player engine records progress and history, not only queue
 *   playback;
 * - Today's "Continue" row and the series pages read progress from this store instead of the stub;
 * - the listener's audio version (localStorage, read synchronously by the engine) is mirrored into
 *   `prefs` so export/transfer carries it, and an imported value is applied back
 *   (cleaned-audio-ux Decision 5).
 *
 * Browser only: on the server (prerender) it does nothing.
 */
import { registerProgressSource, type ProgressRecord as TodayProgress } from "../features/today/personal.ts";
import { parseAudioVersion, type AudioVersion } from "@emunas/i18n";
import {
  PREF_AUDIO_VERSION,
  applyAudioVersion,
  hasStoredAudioVersion,
  onAudioVersionChosen,
  readStoredAudioVersion,
} from "../player-ui/audio-version.ts";
import { getEngine } from "../player-ui/engine.ts";
import { getPersonal, type Personal } from "./personal.ts";
import { attachProgressRecorder } from "./progress-recorder.ts";
import type { PrefRecord, ProgressRecord } from "./schema.ts";

let connected = false;

export function toTodayProgress(r: ProgressRecord): TodayProgress {
  return {
    shiurId: r.shiurId,
    t: r.t,
    completed: r.completedAt !== null,
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

/** Today/series progress source backed by the personal store. */
export function personalProgressSource(personal: Pick<Personal, "ready" | "store">): {
  progress(): Promise<readonly TodayProgress[]>;
} {
  return {
    async progress() {
      await personal.ready();
      return Object.values(personal.store.getState().progress).map(toTodayProgress);
    },
  };
}

type VersionPersonal = Pick<Personal, "ready" | "store" | "setPref">;

/**
 * Keeps `prefs.audioVersion` and the localStorage value in step. localStorage stays the source for
 * the first load: once the store is ready, an explicit local choice is copied into `prefs`, or, when
 * there is none (e.g. a fresh browser), a value from `prefs` is applied. After that, every click is
 * mirrored into `prefs`, and a `prefs` value that arrives from elsewhere (an import) is applied.
 */
export function attachAudioVersionMirror(personal: VersionPersonal, apply: (v: AudioVersion) => void): () => void {
  let last: PrefRecord | undefined;
  let stopped = false;
  let unsubscribe = () => {};
  const offChosen = onAudioVersionChosen((v) => {
    void personal.setPref(PREF_AUDIO_VERSION, v);
  });
  const valueOf = (rec: PrefRecord | undefined) => (rec ? parseAudioVersion(rec.value) : null);
  void personal.ready().then(() => {
    if (stopped) return;
    const rec = personal.store.getState().prefs[PREF_AUDIO_VERSION];
    last = rec;
    const local = readStoredAudioVersion();
    if (hasStoredAudioVersion()) {
      if (valueOf(rec) !== local) void personal.setPref(PREF_AUDIO_VERSION, local);
    } else if (rec && valueOf(rec) !== local) {
      applyAudioVersion(valueOf(rec)!, apply, { announce: false, mirror: false });
    }
    unsubscribe = personal.store.subscribe((st) => {
      const next = st.prefs[PREF_AUDIO_VERSION];
      if (next === last) return;
      last = next;
      const v = valueOf(next);
      if (v !== null && v !== readStoredAudioVersion()) applyAudioVersion(v, apply, { announce: false, mirror: false });
    });
  });
  return () => {
    stopped = true;
    offChosen();
    unsubscribe();
  };
}

export function connectPersonal(): void {
  if (connected || typeof window === "undefined") return;
  connected = true;
  const personal = getPersonal();
  registerProgressSource(personalProgressSource(personal));
  attachProgressRecorder(getEngine(), personal);
  attachAudioVersionMirror(personal, (v) => getEngine().setAudioVersion(v));
}
