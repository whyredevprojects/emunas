/**
 * The listener's audio version (cleaned-audio-ux Decision 5, §6): guarded localStorage, the dock's
 * notice priority, and the mirror into the personal store's `prefs` (export/transfer carries it).
 */
import { AUDIO_VERSION_KEY, type AudioVersion } from "@emunas/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryBackend } from "../store/backend.ts";
import { attachAudioVersionMirror } from "../store/connect.ts";
import { createPersonal, type Personal } from "../store/personal.ts";
import {
  PREF_AUDIO_VERSION,
  applyAudioVersion,
  readStoredAudioVersion,
  writeStoredAudioVersion,
} from "./audio-version.ts";
import { IDLE_STATE } from "./engine.ts";
import { noticeKind } from "./PlayerDock.tsx";
import { versionLineState } from "./VersionLine.tsx";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const open: Personal[] = [];
function personal(): Personal {
  const p = createPersonal({ open: async () => ({ backend: new MemoryBackend(), fallbackReason: "test" }), channel: null });
  open.push(p);
  return p;
}

async function tick(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const p of open.splice(0)) p.dispose();
});

describe("stored preference", () => {
  it("defaults to the original and survives a blocked store", () => {
    expect(readStoredAudioVersion()).toBe("original");
    localStorage.setItem(AUDIO_VERSION_KEY, "garbage");
    expect(readStoredAudioVersion()).toBe("original");
    writeStoredAudioVersion("cleaned");
    expect(readStoredAudioVersion()).toBe("cleaned");

    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(readStoredAudioVersion()).toBe("original");
    expect(() => writeStoredAudioVersion("cleaned")).not.toThrow();
  });
});

describe("dock notice priority", () => {
  const st = (over: Partial<typeof IDLE_STATE>) => ({ ...IDLE_STATE, shiurId: "s", status: "playing" as const, ...over });
  const skip = { shiurId: "s", kind: "singing" as const, from: 1, to: 30, seconds: 29 };

  it("unavailable > error > moment ended > fallback > skipped > version line", () => {
    expect(noticeKind(st({}), "cleaned")).toBe("version");
    expect(noticeKind(st({}), null)).toBeNull();
    expect(noticeKind(st({ lastSkip: skip }), "cleaned")).toBe("skip");
    expect(noticeKind(st({ lastSkip: skip, versionFallback: true }), "original")).toBe("fallback");
    expect(noticeKind(st({ momentEnded: true, versionFallback: true }), "original")).toBe("moment");
    expect(noticeKind(st({ status: "error", momentEnded: true }), "cleaned")).toBe("error");
    expect(noticeKind(st({ status: "unavailable" }), "cleaned")).toBe("unavailable");
  });

  it("has no line without an improved copy (state C)", () => {
    expect(versionLineState("cleaned", true)).toBe("cleaned");
    expect(versionLineState("original", true)).toBe("original");
    expect(versionLineState("original", false)).toBeNull();
  });
});

describe("mirror into the personal store", () => {
  it("copies an explicit local choice into prefs and mirrors every click", async () => {
    localStorage.setItem(AUDIO_VERSION_KEY, "original");
    const p = personal();
    const applied: AudioVersion[] = [];
    const stop = attachAudioVersionMirror(p, (v) => applied.push(v));
    await p.ready();
    await tick();
    expect(p.store.getState().prefs[PREF_AUDIO_VERSION]?.value).toBe("original");
    expect(applied).toEqual([]);

    applyAudioVersion("cleaned", (v) => applied.push(v), { announce: false });
    await tick();
    expect(p.store.getState().prefs[PREF_AUDIO_VERSION]?.value).toBe("cleaned");
    expect(localStorage.getItem(AUDIO_VERSION_KEY)).toBe("cleaned");
    expect((await p.exportFile()).data.prefs).toContainEqual(expect.objectContaining({ key: PREF_AUDIO_VERSION, value: "cleaned" }));
    stop();
  });

  it("applies a value from prefs when there is no local choice, and an imported one later", async () => {
    const p = personal();
    await p.ready();
    await p.setPref(PREF_AUDIO_VERSION, "cleaned");
    const applied: AudioVersion[] = [];
    const stop = attachAudioVersionMirror(p, (v) => applied.push(v));
    await tick();
    expect(applied).toEqual(["cleaned"]);
    expect(localStorage.getItem(AUDIO_VERSION_KEY)).toBe("cleaned");

    // An import (or another tab) changes the stored pref: the engine follows.
    await p.setPref(PREF_AUDIO_VERSION, "original");
    await tick();
    expect(applied).toEqual(["cleaned", "original"]);
    expect(localStorage.getItem(AUDIO_VERSION_KEY)).toBe("original");
    stop();
  });
});
