/**
 * W2.4 acceptance in a real browser: en and yi render mirrored (geometry diff of the shell, plus
 * screenshots attached to the report), axe is clean on every stub in both languages, client navigation
 * between all stubs keeps the very same dock element, and focus moves to the h1. Light by default
 * whatever the OS prefers; the dark-colours toggle stores the shared cookie and survives a reload.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const STUB_PATHS = [
  "",
  "s/yi-tanya-1-01",
  "explore",
  "seforim",
  "seforim/bereishis",
  "seforim/bereishis/6",
  "maasios",
  "series",
  "series/tanya-yi",
  "p/rabbi-akiva",
  "c/%D7%AA%D7%95%D7%A8%D7%94-%D7%9C%D7%A9%D7%9E%D7%94",
  "o/%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA",
  "search?q=teshuvah",
  "shelf",
  "shelf/queue",
  "pl",
];

async function ready(page: Page): Promise<void> {
  await page.locator("main h1").first().waitFor();
  await page.waitForFunction(() => document.fonts.status === "loaded");
}

type Box = { x: number; y: number; width: number; height: number };

async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
}

test.describe("mirroring", () => {
  test("yi is the mirror image of en (shell geometry)", async ({ page }, info) => {
    const width = page.viewportSize()!.width;
    const selectors = [
      "header a[href$='/']",
      "header button",
      "header button[aria-pressed]",
      "nav",
      "nav li:first-child a",
      "main",
      "[data-dock-slot]",
    ];
    const boxes: Record<string, Record<string, Box>> = {};
    for (const ui of ["en", "yi"] as const) {
      await page.goto(`/${ui}/explore`);
      await ready(page);
      await expect(page.locator("html")).toHaveAttribute("lang", ui);
      await expect(page.locator("html")).toHaveAttribute("dir", ui === "yi" ? "rtl" : "ltr");
      boxes[ui] = {};
      for (const s of selectors) boxes[ui]![s] = await box(page, s);
      await info.attach(`shell-${ui}.png`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: "image/png",
      });
    }
    // Elements whose width depends on the language's text are compared by the edge that anchors them.
    const anchor: Record<string, "start" | "end" | "box"> = {
      "header a[href$='/']": "start",
      "header button": "end",
      "nav li:first-child a": "start",
    };
    for (const s of selectors) {
      const en = boxes["en"]![s]!;
      const yi = boxes["yi"]![s]!;
      // Same vertical placement; horizontal position reflected around the viewport centre.
      expect(Math.abs(en.y - yi.y), `${s} y`).toBeLessThanOrEqual(1);
      const mode = anchor[s] ?? "box";
      if (mode === "start") {
        expect(Math.abs(en.x - (width - (yi.x + yi.width))), `${s} start edge`).toBeLessThanOrEqual(1.5);
      } else if (mode === "end") {
        expect(Math.abs(en.x + en.width - (width - yi.x)), `${s} end edge`).toBeLessThanOrEqual(1.5);
      } else {
        expect(Math.abs(en.width - yi.width), `${s} width`).toBeLessThanOrEqual(1);
        expect(Math.abs(en.x - (width - (yi.x + yi.width))), `${s} x`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("screenshot diff: the text-free shell in yi equals the en shell flipped horizontally", async ({
    page,
  }, info) => {
    const shots: Record<string, string> = {};
    for (const ui of ["en", "yi"] as const) {
      await page.goto(`/${ui}/explore`);
      await ready(page);
      // Hide glyphs and page content: what remains is the shell chrome (rail, header, dock, rules).
      await page.addStyleTag({
        content:
          "* { color: transparent !important; text-decoration: none !important; } main > * { visibility: hidden; }",
      });
      const png = await page.screenshot();
      await info.attach(`chrome-${ui}.png`, { body: png, contentType: "image/png" });
      shots[ui] = `data:image/png;base64,${png.toString("base64")}`;
    }
    const ratio = await page.evaluate(
      async ({ en, yi }) => {
        const load = (src: string) =>
          new Promise<HTMLImageElement>((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = src;
          });
        const [a, b] = await Promise.all([load(en), load(yi)]);
        const w = a.width;
        const h = a.height;
        const draw = (img: HTMLImageElement, flip: boolean) => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d")!;
          if (flip) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, w, h).data;
        };
        const pa = draw(a, true);
        const pb = draw(b, false);
        let diff = 0;
        for (let i = 0; i < pa.length; i += 4) {
          const d = Math.abs(pa[i]! - pb[i]!) + Math.abs(pa[i + 1]! - pb[i + 1]!) + Math.abs(pa[i + 2]! - pb[i + 2]!);
          if (d > 48) diff++;
        }
        return diff / (w * h);
      },
      { en: shots["en"]!, yi: shots["yi"]! },
    );
    expect(ratio).toBeLessThan(0.005);
  });
});

test.describe("layout", () => {
  test("the dock height is reserved and nothing overlaps it", async ({ page }) => {
    await page.goto("/en/");
    await ready(page);
    const dock = await box(page, "[data-dock-slot]");
    const vh = page.viewportSize()!.height;
    expect(dock.y + dock.height).toBeCloseTo(vh, 0);
    expect(dock.height).toBeGreaterThanOrEqual(64);
    const pad = await page.locator("main").evaluate((m) => getComputedStyle(m.parentElement!).paddingBlockEnd);
    expect(parseFloat(pad)).toBeGreaterThanOrEqual(dock.height);
  });
});

test.describe("accessibility", () => {
  for (const ui of ["en", "yi"] as const) {
    test(`axe finds no violations on any stub (${ui})`, async ({ page }) => {
      for (const p of STUB_PATHS) {
        await page.goto(`/${ui}/${p}`);
        await ready(page);
        const result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
          `${ui}/${p}`,
        ).toEqual([]);
      }
    });
  }

  test("axe is clean with the language popover open", async ({ page }) => {
    await page.goto("/yi/");
    await ready(page);
    await page.getByRole("button", { name: "שפראך" }).click();
    await page.getByRole("dialog").waitFor();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });
});

test.describe("colour theme", () => {
  test.use({ colorScheme: "dark" });

  test("light by default even when the OS prefers dark; the toggle persists dark across reloads", async ({
    page,
    context,
  }) => {
    await page.goto("/en/explore");
    await ready(page);
    const html = page.locator("html");
    const toggle = page.getByRole("button", { name: "Dark colours" });
    const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await expect(html).not.toHaveAttribute("data-theme");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    const light = await paper();

    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(await paper()).not.toBe(light);
    const cookie = (await context.cookies()).find((c) => c.name === "emunas_theme");
    expect(cookie).toMatchObject({ value: "dark", path: "/", sameSite: "Lax", domain: "127.0.0.1" });

    await page.reload();
    await ready(page);
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    // The cookie is shared: a dark choice reaches every page, also in the other language.
    await page.goto("/yi/");
    await ready(page);
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "טונקעלע פארבן" }).click();
    await expect(html).not.toHaveAttribute("data-theme");
    expect((await context.cookies()).find((c) => c.name === "emunas_theme")?.value).toBe("light");
    await page.reload();
    await ready(page);
    await expect(html).not.toHaveAttribute("data-theme");
  });

  for (const ui of ["en", "yi"] as const) {
    test(`axe finds no violations in dark colours (${ui})`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "emunas_theme", value: "dark", url: baseURL! }]);
      for (const p of ["", "explore", "search?q=teshuvah", "shelf"]) {
        await page.goto(`/${ui}/${p}`);
        await ready(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        const result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
          `${ui}/${p} (dark)`,
        ).toEqual([]);
      }
    });
  }
});

test.describe("client navigation", () => {
  test("the dock element survives navigation through every stub and the language switch", async ({ page }) => {
    await page.goto("/en/");
    await ready(page);
    await page.locator("[data-dock-slot]").evaluate((el) => {
      (el as HTMLElement & { __probe?: number }).__probe = 42;
    });
    const loads: string[] = [];
    page.on("load", () => loads.push(page.url()));

    for (const ui of ["en", "yi"] as const) {
      // Rail links
      const links = page.locator("nav a");
      const n = await links.count();
      for (let i = 0; i < n; i++) {
        await links.nth(i).click();
        await ready(page);
      }
      // Every other stub through in-app navigation (history API, as a Link would)
      for (const p of STUB_PATHS) {
        await page.evaluate(async (to) => {
          const w = window as unknown as { __reactRouterDataRouter?: { navigate(to: string): Promise<void> } };
          await w.__reactRouterDataRouter!.navigate(to);
        }, `/${ui}/${p}`);
        await ready(page);
      }
      // Language switch link in the header
      await page.locator(`header a[hreflang="${ui === "en" ? "yi" : "en"}"]`).click();
      await ready(page);
    }

    expect(loads).toEqual([]); // no full page load happened
    const probe = await page
      .locator("[data-dock-slot]")
      .evaluate((el) => (el as HTMLElement & { __probe?: number }).__probe);
    expect(probe).toBe(42);
  });

  test("focus moves to the h1 after navigation", async ({ page }) => {
    await page.goto("/en/");
    await ready(page);
    await page.locator("nav a", { hasText: "Maasios" }).click();
    await expect(page.locator("main h1")).toBeFocused();
    await expect(page).toHaveTitle(/Maasios/);
  });

  test("/ redirects to the browser's language", async ({ browser }) => {
    for (const [locale, ui] of [
      ["en-US", "en"],
      ["he-IL", "yi"],
    ] as const) {
      const ctx = await browser.newContext({ locale });
      const page = await ctx.newPage();
      await page.goto("/");
      await page.waitForURL(`**/${ui}/`);
      await expect(page.locator("html")).toHaveAttribute("dir", ui === "yi" ? "rtl" : "ltr");
      await ctx.close();
    }
  });

  test("settings from the query string survive and the menu writes them back", async ({ page }) => {
    await page.goto("/en/explore?audio=yi");
    await ready(page);
    await page.getByRole("button", { name: "Language" }).click();
    await expect(page.getByRole("radio", { name: "Yiddish only" })).toBeChecked();
    await page.getByRole("radio", { name: "English only" }).check({ force: true });
    await expect(page).toHaveURL(/audio=en/);
  });
});
