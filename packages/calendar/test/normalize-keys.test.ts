/**
 * Integration check (wave 1): the calendar table's parsha and occasion keys must be the
 * @emunas/normalize keys, because both sites join catalog shiurim to calendar weeks by key.
 * Test-only dependency; the runtime entry still imports nothing but the table.
 */
import { PARSHIYOS, OCCASIONS, OTHER_OCCASION_KEY } from "@emunas/normalize";
import { describe, expect, it } from "vitest";
import { PARSHA_KEYS } from "../scripts/generate.ts";
import { calendar, asCalendarTable } from "../src/index.ts";
import rawTable from "../table/5787-5800.json" with { type: "json" };

const table = asCalendarTable(rawTable);
const parshaKeys = new Set(PARSHIYOS.map((p) => p.key));
const occasionKeys = new Set(OCCASIONS.map((o) => o.key));

describe("calendar keys match @emunas/normalize", () => {
  it("every generator parsha key is a normalize parsha key", () => {
    expect(PARSHA_KEYS.filter((k) => !parshaKeys.has(k))).toEqual([]);
  });

  it("every parsha key in the table (single and combined) is a normalize parsha key", () => {
    const used = new Set<string>();
    for (const [, d, i] of table.shabbosos) {
      if (d !== null) used.add(d);
      if (i !== null) used.add(i);
    }
    for (const [combined, parts] of Object.entries(table.combined)) {
      used.add(combined);
      for (const p of parts) used.add(p);
    }
    expect([...used].filter((k) => !parshaKeys.has(k)).sort()).toEqual([]);
  });

  it("combined parshiyos list the same parts in both packages", () => {
    for (const [combined, parts] of Object.entries(table.combined)) {
      const row = PARSHIYOS.find((p) => p.key === combined);
      expect(row?.parts, combined).toEqual(parts);
    }
  });

  it("every occasion key in the table is a normalize occasion key", () => {
    const used = new Set(table.occasions.map((r) => r[0]));
    expect([...used].filter((k) => !occasionKeys.has(k)).sort()).toEqual([]);
    expect(used.has(OTHER_OCCASION_KEY)).toBe(false);
  });

  it("the runtime resolves this week's parsha to a normalize key", () => {
    const w = calendar.thisWeek("2026-11-15");
    expect(w).not.toBeNull();
    for (const k of w?.parshaKeys ?? []) expect(parshaKeys.has(k)).toBe(true);
  });
});
