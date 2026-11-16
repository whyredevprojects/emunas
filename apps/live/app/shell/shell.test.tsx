// @vitest-environment jsdom
/**
 * The app shell in a DOM: every stub route renders in both interface languages inside the shell,
 * `<html lang dir>` follows `:ui`, client navigation through all stubs (and across the language
 * switch) never remounts what is mounted in the dock slot, focus moves to the page h1, settings sync
 * with the query string, and axe finds no violations (colour contrast and document title are checked
 * in the browser e2e instead, jsdom cannot compute them).
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useEffect, type JSX } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UI_CHILD_ROUTES } from "../routes.ts";
import { registerDock } from "./dock.tsx";
import { PageStub } from "./PageStub.tsx";
import { switchUiHref } from "./LanguageMenu.tsx";
import { railItems } from "./Rail.tsx";
import { DEFAULT_SETTINGS, settingsStore } from "./settings.ts";
import { SHELL_CLASSES } from "./styles.ts";
import { createTestRouter } from "./test-router.tsx";

/** One concrete URL per stub route (both languages are derived from these). */
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
  "c/תורה-לשמה",
  "o/בראשית",
  "search",
  "shelf",
  "shelf/queue",
  "pl",
  "no/such/page",
];

let restoreDock: () => void = () => {};

beforeAll(() => {
  // jsdom has no canvas; axe probes it for icon-font checks. Report "unsupported" instead of logging.
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  settingsStore.getState().reset();
});

afterEach(() => {
  cleanup();
  restoreDock();
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
  document.documentElement.removeAttribute("data-theme");
  document.cookie = "emunas_theme=; Path=/; Max-Age=0";
});

async function renderAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  return { router, ...utils };
}

async function go(router: ReturnType<typeof createTestRouter>, to: string) {
  await act(async () => {
    await router.navigate(to);
  });
}

describe("route table", () => {
  it("has a stub for every tech-live §1 route", () => {
    const paths = UI_CHILD_ROUTES.map((r) => (r.index ? "" : r.path));
    expect(paths).toEqual([
      "",
      "s/:shiurId",
      "explore",
      "seforim",
      "seforim/:workId",
      "seforim/:workId/:chapter",
      "maasios",
      "maasios/:storyId",
      "series",
      "series/:seriesId",
      "p/:personId",
      "c/:conceptId",
      "o/:occasionId",
      "t/:topicId",
      "th/:threadId",
      "search",
      "shelf",
      "shelf/:section",
      "pl",
      "*",
    ]);
  });
});

describe("shell rendering", () => {
  for (const ui of ["en", "yi"] as const) {
    it(`renders every stub with one h1 inside the shell (${ui})`, async () => {
      const { router, container } = await renderAt(`/${ui}/`);
      for (const p of STUB_PATHS) {
        await go(router, `/${ui}/${p}`);
        const main = container.querySelector("main#main")!;
        expect(main, p).not.toBeNull();
        expect(main.querySelectorAll("h1"), p).toHaveLength(1);
        expect(container.querySelector("[data-dock-slot]"), p).not.toBeNull();
        expect(container.querySelector(`nav[aria-label]`), p).not.toBeNull();
        expect(document.documentElement.lang).toBe(ui);
        expect(document.documentElement.dir).toBe(ui === "yi" ? "rtl" : "ltr");
      }
    });
  }

  it("shows data params direction-isolated with the right lang", async () => {
    // The entity routes became real pages (W4.2); the stub component is checked on its own.
    const router = createMemoryRouter(
      [{ path: "/:ui/x", element: <PageStub title="page.concept" lead="page.concept.lead" params={{ id: "תורה-לשמה" }} /> }],
      { initialEntries: ["/en/x"] },
    );
    const { container } = render(<RouterProvider router={router} />);
    const bdi = container.querySelector("p bdi")!;
    expect(bdi.textContent).toBe("תורה-לשמה");
    expect(bdi.getAttribute("dir")).toBe("rtl");
    expect(bdi.getAttribute("lang")).toBe("he");
  });

  it("renders Yiddish strings in yi and marks the active rail item", async () => {
    const { container } = await renderAt("/yi/seforim");
    const nav = container.querySelector("nav")!;
    const current = nav.querySelector('[aria-current="page"]')!;
    expect(current.textContent).toBe("ספרים");
    expect(container.querySelector("h1")!.textContent).toBe("ספרים");
  });

  it("marks Today active only on the home page", async () => {
    const { router, container } = await renderAt("/en/");
    expect(container.querySelector('nav [aria-current="page"]')!.textContent).toBe("Today");
    await go(router, "/en/explore");
    expect(container.querySelector('nav [aria-current="page"]')!.textContent).toBe("Explore");
  });

  it("shows not-found for an unknown interface language", async () => {
    const { container } = await renderAt("/fr/");
    expect(container.querySelector("h1")!.textContent).toBe("Page not found");
    expect(container.querySelector("[data-dock-slot]")).toBeNull();
  });

  it("reserves the dock and shows the idle text until a player registers", async () => {
    await renderAt("/en/");
    expect(screen.getByText("Nothing is playing")).toBeTruthy();
  });
});

describe("dock persistence", () => {
  it("never remounts the dock content across navigation through all stubs and the language switch", async () => {
    let mounts = 0;
    let unmounts = 0;
    function Probe(): JSX.Element {
      useEffect(() => {
        mounts++;
        return () => {
          unmounts++;
        };
      }, []);
      return <div data-testid="probe">probe</div>;
    }
    restoreDock = registerDock(Probe);

    const { router, container } = await renderAt("/en/");
    const node = screen.getByTestId("probe");
    expect(mounts).toBe(1);

    for (const ui of ["en", "yi", "en"] as const) {
      for (const p of STUB_PATHS) await go(router, `/${ui}/${p}?t=12`);
      // Rail links (real clicks, client-side navigation)
      for (const item of railItems(ui)) {
        const link = within(container.querySelector("nav")!)
          .getAllByRole("link")
          .find((a) => a.getAttribute("href") === item.to)!;
        await act(async () => {
          fireEvent.click(link);
        });
        expect(router.state.location.pathname).toBe(item.to);
      }
      // Language switch link
      const sw = container.querySelector<HTMLAnchorElement>(`a[hreflang="${ui === "en" ? "yi" : "en"}"]`)!;
      await act(async () => {
        fireEvent.click(sw);
      });
    }

    expect(screen.getByTestId("probe")).toBe(node);
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
  });
});

describe("focus management", () => {
  it("moves focus to the page h1 after navigation but not on first load", async () => {
    const { router } = await renderAt("/en/");
    expect(document.activeElement).toBe(document.body);
    await go(router, "/en/explore");
    const h1 = document.querySelector("main h1")!;
    expect(document.activeElement).toBe(h1);
    expect(h1.getAttribute("tabindex")).toBe("-1");
    await go(router, "/yi/maasios");
    expect(document.activeElement?.textContent).toBe("מעשיות");
  });

  it("does not steal focus on query-only changes", async () => {
    const { router } = await renderAt("/en/s/x");
    const link = document.querySelector<HTMLAnchorElement>("nav a")!;
    link.focus();
    await go(router, "/en/s/x?t=754");
    expect(document.activeElement).toBe(link);
  });
});

describe("language settings", () => {
  it("applies ?audio and ?read from the URL to the store", async () => {
    await renderAt("/en/explore?audio=yi&read=yi");
    expect(settingsStore.getState().audio).toBe("yi");
    expect(settingsStore.getState().read).toBe("yi");
  });

  it("keeps settings across navigation without the query string", async () => {
    const { router } = await renderAt("/en/?audio=en");
    await go(router, "/en/explore");
    expect(settingsStore.getState().audio).toBe("en");
  });

  it("writes changes from the menu into the query string", async () => {
    const { router } = await renderAt("/en/explore?q=keep");
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    await act(async () => {});
    const radio = await screen.findByRole("radio", { name: "Yiddish only" });
    await act(async () => {
      fireEvent.click(radio);
    });
    expect(settingsStore.getState().audio).toBe("yi");
    const search = new URLSearchParams(router.state.location.search);
    expect(search.get("audio")).toBe("yi");
    expect(search.get("q")).toBe("keep");
    expect(settingsStore.getState()).toMatchObject({ read: DEFAULT_SETTINGS.read });
  });

  it("switch link keeps path, query and hash", () => {
    expect(switchUiHref({ pathname: "/en/s/abc", search: "?t=5", hash: "#x" }, "yi")).toBe("/yi/s/abc?t=5#x");
    expect(switchUiHref({ pathname: "/yi/", search: "", hash: "" }, "en")).toBe("/en/");
    expect(switchUiHref({ pathname: "/yi", search: "", hash: "" }, "en")).toBe("/en/");
  });
});

describe("dark colours toggle", () => {
  it("is off by default, and toggles data-theme and the shared cookie", async () => {
    await renderAt("/en/explore");
    const button = screen.getByRole("button", { name: "Dark colours" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.dataset["theme"]).toBeUndefined();

    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    expect(document.cookie).toContain("emunas_theme=dark");

    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.dataset["theme"]).toBeUndefined();
    expect(document.cookie).toContain("emunas_theme=light");
  });

  it("reflects a theme applied before mount and changes made elsewhere", async () => {
    document.documentElement.dataset["theme"] = "dark";
    await renderAt("/yi/");
    const button = screen.getByRole("button", { name: "טונקעלע פארבן" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      delete document.documentElement.dataset["theme"];
    });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("accessibility (axe, jsdom)", () => {
  for (const ui of ["en", "yi"] as const) {
    it(`has no axe violations on any stub (${ui})`, async () => {
      const { router } = await renderAt(`/${ui}/`);
      for (const p of STUB_PATHS) {
        await go(router, `/${ui}/${p}`);
        const result = await axe.run(document, {
          rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } },
        });
        expect(
          result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
          `${ui}/${p}`,
        ).toEqual([]);
      }
    });
  }
});

describe("styles", () => {
  it("SHELL_CLASSES lists exactly the classes in Shell.module.css", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Shell.module.css"), "utf8");
    const found = new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]!));
    expect([...found].sort()).toEqual([...SHELL_CLASSES].sort());
  });
});
