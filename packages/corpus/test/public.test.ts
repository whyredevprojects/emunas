import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  momentId,
  offsetsFor,
  parseMomentId,
  shiurIdOf,
  timelineDuration,
  toGlobal,
  toLocal,
  type IndexRow,
  type PublicNotes,
  type PublicRecording,
  type PublicShiur,
} from "../src/public/index.ts";

/** Every property name at any depth of T (arrays and records included). */
type DeepKeys<T> = T extends readonly (infer U)[]
  ? DeepKeys<U>
  : T extends object
    ? { [K in keyof T]-?: K | DeepKeys<NonNullable<T[K]>> }[keyof T]
    : never;

type Forbidden =
  | "heardAs"
  | "asrNotes"
  | "segs"
  | "startSeg"
  | "endSeg"
  | "questionSegs"
  | "answerSegs"
  | "segments"
  | "transcriptKey"
  | "audioKey"
  | "asrModel"
  | "model"
  | "variant";

describe("public types", () => {
  it("never include transcript-carrying or internal keys, at any depth", () => {
    expectTypeOf<Extract<DeepKeys<PublicShiur>, Forbidden>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<DeepKeys<PublicNotes>, Forbidden>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<DeepKeys<IndexRow>, Forbidden>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof PublicShiur, Forbidden>>().toEqualTypeOf<never>();
    // sanity: DeepKeys does see nested keys
    expectTypeOf<Extract<DeepKeys<PublicShiur>, "sefariaRef" | "retelling">>().toEqualTypeOf<"sefariaRef" | "retelling">();
  });

  it("transcript descriptor is the literal false", () => {
    expectTypeOf<PublicRecording["transcript"]>().toEqualTypeOf<{ eligible: false }>();
    // Amendment A1: a media URL when playable, null (shown as unavailable) otherwise.
    expectTypeOf<Extract<PublicRecording, { playable: true }>["audioUrl"]>().toEqualTypeOf<
      `https://${string}` | `http://${string}`
    >();
    expectTypeOf<Extract<PublicRecording, { playable: false }>["audioUrl"]>().toEqualTypeOf<null>();
    // The AI-improved copy: a media URL or null (rejected after review); always null when unplayable.
    expectTypeOf<Extract<PublicRecording, { playable: true }>["cleanedUrl"]>().toEqualTypeOf<
      `https://${string}` | `http://${string}` | null
    >();
    expectTypeOf<Extract<PublicRecording, { playable: false }>["cleanedUrl"]>().toEqualTypeOf<null>();
    expectTypeOf<Extract<keyof PublicRecording, "audio">>().toEqualTypeOf<never>();
  });
});

describe("timeline", () => {
  const tl = {
    recordings: [
      { id: "a", offset: 0, duration: 100 },
      { id: "b", offset: 100, duration: 50.5 },
      { id: "c", offset: 150.5, duration: 20 },
    ],
  };

  it("maps global ↔ local across recordings", () => {
    expect(toLocal(tl, 0)).toEqual({ recordingId: "a", t: 0 });
    expect(toLocal(tl, 99.9)).toEqual({ recordingId: "a", t: 99.9 });
    expect(toLocal(tl, 100)).toEqual({ recordingId: "b", t: 0 });
    expect(toLocal(tl, 160)).toEqual({ recordingId: "c", t: 9.5 });
    expect(toLocal(tl, 1000)).toEqual({ recordingId: "c", t: 20 });
    expect(toLocal(tl, -5)).toEqual({ recordingId: "a", t: 0 });
    expect(toGlobal(tl, "b", 10)).toBe(110);
    expect(toGlobal(tl, "zzz", 10)).toBeNull();
    expect(toLocal({ recordings: [] }, 3)).toBeNull();
    expect(timelineDuration(tl)).toBe(170.5);
  });

  it("round-trips for any time inside the timeline", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.5, max: 5000, noNaN: true }), { minLength: 1, maxLength: 5 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (durs, frac) => {
          const d = durs.map((x) => Math.round(x * 1000) / 1000);
          const offs = offsetsFor(d);
          const t = { recordings: d.map((duration, i) => ({ id: `r${i}`, offset: offs[i]!, duration })) };
          const g = Math.round(frac * timelineDuration(t) * 1000) / 1000;
          const local = toLocal(t, g)!;
          const back = toGlobal(t, local.recordingId, local.t)!;
          expect(Math.abs(back - g)).toBeLessThan(0.0015);
        },
      ),
    );
  });

  it("offsets are cumulative durations", () => {
    expect(offsetsFor([10, 20.25, 5])).toEqual([0, 10, 30.25]);
  });
});

describe("moment ids", () => {
  it("build and parse", () => {
    expect(momentId("yi-tanya-1-01", "s", 3)).toBe("yi-tanya-1-01~s3");
    expect(momentId("en-x-01", "wen", 2, 1)).toBe("en-x-01~wen2.1");
    expect(parseMomentId("yi-tanya-1-01~st12")).toEqual({ shiurId: "yi-tanya-1-01", kind: "st", index: 12 });
    expect(parseMomentId("en-x-01~wyi0.4")).toEqual({ shiurId: "en-x-01", kind: "wyi", index: 0, sub: 4 });
    expect(parseMomentId("en-x-01~src5")).toEqual({ shiurId: "en-x-01", kind: "src", index: 5 });
    expect(parseMomentId("en-x-01~s1.2")).toBeNull();
    expect(parseMomentId("en-x-01~wen1")).toBeNull();
    expect(parseMomentId("nonsense")).toBeNull();
    expect(shiurIdOf("en-x-01~kp0")).toBe("en-x-01");
    expect(shiurIdOf("en-x-01")).toBe("en-x-01");
    expect(() => momentId("Bad Id", "s", 0)).toThrow();
    expect(() => momentId("ok", "wen", 0)).toThrow();
  });

  it("round-trip for every kind", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("kp", "s", "i", "tk", "q", "st", "src", "ol", "ab", "wen", "wyi"),
        fc.nat(500),
        fc.nat(50),
        (kind, i, j) => {
          const sub = kind === "wen" || kind === "wyi" ? j : undefined;
          const id = momentId("yi-zmanim-tv-bb-04", kind, i, sub);
          const p = parseMomentId(id)!;
          expect(p.kind).toBe(kind);
          expect(p.index).toBe(i);
          expect(p.sub).toBe(sub);
        },
      ),
    );
  });
});
