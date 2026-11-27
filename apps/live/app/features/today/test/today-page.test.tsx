// @vitest-environment jsdom
/**
 * Today in the real route tree, over the W2.4 fixture files. The fixture Today files carry the
 * normalize occasion keys the W3.6 emitter writes, so the calendar join is exercised end to end.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { RouterProvider } from "react-router";
import { UI_DIR, UI_LANGS } from "@emunas/i18n";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureData, resetDataConfig, type DataFetch, type ShiurFile, type TodayFile } from "../live-data.ts";
import { buildFixture, fixtureFetch, shiurNoachFixture as shiurNoach, todayFixture, todayHeFixture } from "./fixtures.ts";
import { MAX_NEWLY } from "../model.ts";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { momentContent } from "../format.ts";
import { todayT } from "../strings.ts";
import { registerProgressSource } from "../personal.ts";

const dataFetch: DataFetch = fixtureFetch;

let restore: () => void = () => {};

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  configureData({ fetch: dataFetch });
  settingsStore.getState().reset();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

afterEach(() => {
  cleanup();
  restore();
  restore = () => {};
  resetDataConfig();
});

async function renderAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  await waitFor(() => expect(utils.container.querySelector("[data-testid=corpus-counter]")).not.toBeNull());
  return { router, ...utils };
}

// Noach 5787 is read on Shabbos 17 Oct 2026; Wednesday 14 Oct is in its week.
const NOACH_WEEK = "2026-10-14";

describe("Today page", () => {
  it("shows this week's parsha with its shiurim, the Hebrew date and the counter", async () => {
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}`);
    expect(container.querySelectorAll("main h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Today");
    expect(container.textContent).toContain("3 Cheshvan 5787");
    const parsha = container.querySelector('[data-parsha="noach"]')!;
    expect(parsha).not.toBeNull();
    expect([...parsha.querySelectorAll("[data-shiur]")].map((a) => a.getAttribute("data-shiur"))).toEqual(["en-parsha-en-nch-01"]);
    expect(parsha.querySelector("a[data-shiur]")!.getAttribute("href")).toBe("/en/s/en-parsha-en-nch-01");
    const { full, total } = buildFixture.counts;
    expect(screen.getByTestId("corpus-counter").textContent).toBe(`${full} of ${total} shiurim have notes so far.`);
  });

  it("shows the moment of the day with its text and a deep link, the same on every load", async () => {
    const first = await renderAt(`/en/?date=${NOACH_WEEK}`);
    const box = await waitFor(() => {
      const el = first.container.querySelector("[data-moment]");
      // The box renders before the shiur file arrives (the "From:" title already carries `lang`),
      // so wait for its loading line to go, not for any `[lang]` element.
      if (!el || el.textContent!.includes(todayT("en")("today.loading"))) throw new Error("moment not loaded");
      return el;
    });
    const id = box.getAttribute("data-moment")!;
    expect(id.startsWith("en-parsha-en-nch-01~")).toBe(true);
    const content = momentContent(shiurNoach as unknown as ShiurFile, id)!;
    expect(box.textContent).toContain(content.text.en);
    const play = [...box.querySelectorAll("a")].find((a) => a.getAttribute("href")?.startsWith("/en/s/"))!;
    expect(play.getAttribute("href")).toMatch(new RegExp(`^/en/s/en-parsha-en-nch-01\\?t=\\d+(?:\\.\\d{1,3})?&m=${id.replace("~", "~")}$`));
    cleanup();
    const second = await renderAt(`/en/?date=${NOACH_WEEK}`);
    await waitFor(() => expect(second.container.querySelector("[data-moment]")?.getAttribute("data-moment")).toBe(id));
  });

  it("in a gap between occasions shows the next one, and long windows as links", async () => {
    // Noach week: nothing until Chanukah (5 Dec 2026), 52 days off
    const gap = await renderAt(`/en/?date=${NOACH_WEEK}`);
    const next = gap.container.querySelector('[data-occasion="chanukah"]')!;
    expect(next.querySelector("h3")!.textContent).toContain("Next: in 52 days");
    expect(next.querySelectorAll("[data-shiur]").length).toBeGreaterThan(0);
    // one shiur in the fixtures: no entity/o page, so the title is not a link
    expect(next.querySelector("h3 a")).toBeNull();
    expect(gap.container.querySelector("[data-seasons]")).toBeNull();
    cleanup();
    // 2nd day of Pesach 5787: Pesach is a row; Nisan and Sefirah (long) are compact links
    const pesach = await renderAt(`/en/?date=2027-04-23`);
    expect(pesach.container.querySelector('[data-occasion="pesach"] h3')!.textContent).toContain("Now");
    expect(pesach.container.querySelector('[data-occasion="nisan"]')).toBeNull();
    const links = [...pesach.container.querySelectorAll("[data-seasons] [data-season]")];
    expect(links.map((l) => l.getAttribute("data-season"))).toEqual(["nisan", "sefirah"]);
    // Nisan has one shiur in the fixtures, so no page: a plain chip, not a link
    expect(links[0]!.querySelector("a")).toBeNull();
    // the list is named by its label, and each link reads "<name>, Now"
    const list = pesach.container.querySelector("[data-seasons] ul")!;
    expect(pesach.container.querySelector(`#${list.getAttribute("aria-labelledby")}`)!.textContent).toBe("Also now and coming:");
    expect(links[0]!.textContent).toMatch(/Nisan.*, Now$/);
    cleanup();
    // 2027-08-19: Elul (two shiurim, so it has a page) is 14 days off, nearer than Rosh Hashanah: a linked chip
    const av = await renderAt(`/en/?date=2027-08-19`);
    const elul = av.container.querySelector('[data-seasons] [data-season="elul"] a');
    expect(elul!.getAttribute("href")).toMatch(/\/en\/.*elul/);
  });

  it("lists newly summarized shiurim and an empty Continue with the stub store", async () => {
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}`);
    const newly = container.querySelector("#today-newly")!.parentElement!;
    expect(newly.querySelectorAll("a[data-shiur]").length).toBe(Math.min(MAX_NEWLY, todayFixture.newlySummarized.length));
    expect(container.textContent).toContain("Shiurim you start will appear here");
  });

  it("fills Continue from a registered progress source", async () => {
    restore = registerProgressSource({
      progress: () => Promise.resolve([{ shiurId: "yi-zmanim-lvl-01", t: 754, completed: false, updatedAt: "2026-11-14T00:00:00Z" }]),
    });
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}`);
    const section = container.querySelector("#today-continue")!.parentElement!;
    await waitFor(() => expect(section.querySelector("a[data-shiur]")).not.toBeNull());
    const a = section.querySelector("a[data-shiur]")!;
    expect(a.getAttribute("href")).toBe("/en/s/yi-zmanim-lvl-01?t=754");
    expect(a.textContent).toContain("Resume at 12:34");
  });

  it("a failing progress store reads as empty", async () => {
    restore = registerProgressSource({ progress: () => Promise.reject(new Error("blocked")) });
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}`);
    await waitFor(() => expect(container.textContent).toContain("Shiurim you start will appear here"));
  });

  it("filters by the audio language", async () => {
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}&audio=yi`);
    await waitFor(() => expect(container.querySelector('[data-parsha="noach"]')).not.toBeNull());
    expect(container.querySelector('[data-parsha="noach"] a[data-shiur]')).toBeNull();
    expect(container.textContent).toContain("No shiurim on this parsha in the selected language.");
  });

  it("renders in Yiddish with Yiddish strings and Hebrew date", async () => {
    const { container } = await renderAt(`/yi/?date=${NOACH_WEEK}`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("היינט");
    expect(container.textContent).toContain("ג׳ חשון תשפ״ז");
    expect(container.textContent).toContain("פרשת נח");
  });

  it("shows each one-liner in the language its Today file picked, with that lang and dir", async () => {
    const heToday = todayHeFixture as unknown as TodayFile;
    const { container } = await renderAt(`/he/?date=${NOACH_WEEK}`);
    const newly = container.querySelector("#today-newly")!.parentElement!;
    const lines = [...newly.querySelectorAll("a[data-shiur]")].flatMap((a) => {
      const ol = heToday.cards[a.getAttribute("data-shiur")!]!.oneLiner;
      return ol ? [{ a, ol }] : [];
    });
    expect(lines.length).toBeGreaterThan(0);
    for (const { a, ol } of lines) {
      const el = [...a.querySelectorAll("[lang]")].find((x) => x.textContent === ol.text)!;
      expect(el, ol.text).toBeDefined();
      expect(el.getAttribute("lang")).toBe(ol.lang);
      expect(el.getAttribute("dir")).toBe(UI_DIR[ol.lang]);
    }
  });

  it("toggles the Israel schedule and remembers it", async () => {
    // Monday 14 Jun 2027: diaspora still Nasso, Israel already Behaaloscha (no shiurim in fixtures)
    const { container } = await renderAt("/en/?date=2027-06-14");
    expect(container.querySelector('[data-parsha="nasso"]')).not.toBeNull();
    const button = screen.getByRole("button", { name: "Israel schedule" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      button.click();
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-parsha="behaaloscha"]')).not.toBeNull();
    expect(localStorage.getItem("emunas.live.israel")).toBe("1");
  });

  it("shows an error, still with one h1, when the data cannot load", async () => {
    configureData({ fetch: () => Promise.resolve(new Response("", { status: 500 })) });
    const router = createTestRouter(`/en/?date=${NOACH_WEEK}`);
    const { container } = render(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(container.querySelectorAll("main h1")).toHaveLength(1);
  });

  for (const ui of UI_LANGS) {
    it(`has no axe violations (${ui})`, async () => {
      await renderAt(`/${ui}/?date=${NOACH_WEEK}`);
      await waitFor(() => expect(document.querySelector("[data-moment] [lang]")).not.toBeNull());
      const result = await axe.run(document, {
        rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } },
      });
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
});
