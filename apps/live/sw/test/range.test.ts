import { describe, expect, it } from "vitest";
import { parseRange, rangeResponse } from "../src/range.ts";

describe("parseRange", () => {
  const size = 1000;
  it.each([
    ["bytes=0-99", { start: 0, end: 99 }],
    ["bytes=100-", { start: 100, end: 999 }],
    ["bytes=-100", { start: 900, end: 999 }],
    ["bytes=-5000", { start: 0, end: 999 }],
    ["bytes=990-5000", { start: 990, end: 999 }],
    ["bytes=999-999", { start: 999, end: 999 }],
    ["BYTES = 5 - 9", { start: 5, end: 9 }],
  ])("%s", (header, expected) => {
    expect(parseRange(header, size)).toEqual(expected);
  });

  it.each([null, "", "bytes=", "bytes=-", "items=0-1", "bytes=0-1,5-9", "bytes=9-2", "bytes=a-b"])(
    "%s is ignored (whole file)",
    (header) => {
      expect(parseRange(header, size)).toBeNull();
    },
  );

  it.each(["bytes=1000-", "bytes=5000-6000", "bytes=-0"])("%s is unsatisfiable", (header) => {
    expect(parseRange(header, size)).toBe("unsatisfiable");
  });

  it("an empty resource satisfies no range", () => {
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
    expect(parseRange("bytes=-10", 0)).toBe("unsatisfiable");
  });
});

describe("rangeResponse", () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  const cached = () =>
    new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg", etag: '"x"', "x-other": "1" } });

  it("answers a range with 206 and the exact slice", async () => {
    const res = await rangeResponse(cached(), "bytes=10-19");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 10-19/256");
    expect(res.headers.get("content-length")).toBe("10");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("etag")).toBe('"x"');
    expect(res.headers.get("x-other")).toBeNull();
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it("serves an open-ended range to the end (what media elements send first)", async () => {
    const res = await rangeResponse(cached(), "bytes=0-");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-255/256");
    expect((await res.arrayBuffer()).byteLength).toBe(256);
  });

  it("serves a suffix range", async () => {
    const res = await rangeResponse(cached(), "bytes=-6");
    expect(res.headers.get("content-range")).toBe("bytes 250-255/256");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([250, 251, 252, 253, 254, 255]);
  });

  it("answers without Range with 200 and the whole body", async () => {
    const res = await rangeResponse(cached(), null);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("256");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect((await res.arrayBuffer()).byteLength).toBe(256);
  });

  it("answers an unsatisfiable range with 416 and the size", async () => {
    const res = await rangeResponse(cached(), "bytes=300-");
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */256");
  });
});
