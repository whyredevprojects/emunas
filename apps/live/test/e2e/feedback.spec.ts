/**
 * W4.7 acceptance in a real browser (integration-plan §8 W4.7): "Something's wrong here" stores a
 * report, handles a Turnstile failure, is reachable and usable by keyboard alone, and works in both
 * UI languages.
 *
 * Two modes:
 * - Default: `/api/feedback` and the Turnstile script are stood in for inside the browser (the
 *   request body is checked against the Worker's contract in `app/features/feedback/api.test.ts`).
 * - Staging: with `LIVE_E2E_FEEDBACK_API=https://<staging live or api host>`, the report goes to the
 *   real staging `emunas-api` and the real Turnstile script runs with Cloudflare's always-pass test
 *   site key (the build served from 127.0.0.1 picks it). Staging's `TURNSTILE_SECRET` must then be
 *   the matching test secret; the test expects 202 with a stored report id.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";
import { serveSilentMedia } from "./helpers.ts";

const STAGING = process.env["LIVE_E2E_FEEDBACK_API"]?.replace(/\/+$/, "") ?? "";
const SHIUR = "/s/yi-zmanim-tv-bb-04";

/** A stand-in for `window.turnstile`: mode from `window.__turnstileMode` ("pass" | "error"). */
const FAKE_TURNSTILE = `
(() => {
  let n = 0, serial = 0;
  const widgets = new Map();
  const kick = (id) => {
    const o = widgets.get(id);
    if (!o) return;
    setTimeout(() => {
      if (!widgets.has(id)) return;
      if ((window.__turnstileMode || "pass") === "error") o["error-callback"]();
      else o.callback("e2e-token-" + (++serial));
    }, 50);
  };
  window.turnstile = {
    render(el, o) { const id = "w" + (++n); widgets.set(id, o); kick(id); return id; },
    reset(id) { kick(id); },
    remove(id) { widgets.delete(id); },
  };
})();
`;

interface Stub {
  bodies: unknown[];
  /** Statuses to answer with, in order; then 202. */
  queue: number[];
}

async function stubApi(page: Page): Promise<Stub> {
  const stub: Stub = { bodies: [], queue: [] };
  await page.route("https://challenges.cloudflare.com/turnstile/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_TURNSTILE }),
  );
  await page.route("**/api/feedback", async (route) => {
    stub.bodies.push(route.request().postDataJSON());
    const status = stub.queue.shift() ?? 202;
    const body = status === 202 ? { id: `e2e-${stub.bodies.length}` } : status === 403 ? { error: "turnstile_failed" } : { error: "rate_limited" };
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return stub;
}

async function openRoom(page: Page, ui: "en" | "yi"): Promise<void> {
  await page.goto(`/${ui}${SHIUR}`);
  await page.locator("[data-room]").waitFor();
}

const dialog = (page: Page) => page.locator("[data-report-dialog]");

test.describe("against a stand-in API", () => {
  test.skip(STAGING !== "", "staging mode runs the staging test below instead");

  test("keyboard only: Tab to the control, Enter, write a note, choose a reason; Escape returns focus", async ({ page }) => {
    const stub = await stubApi(page);
    // The room loads the shiur paused; with its media reachable, the original is the one cued.
    await serveSilentMedia(page);
    await openRoom(page, "en");
    await expect(page.locator("[data-room-version]")).toContainText("A version with the sound improved by AI is also available");
    const chapter = page.locator("[data-chapter='0']");
    const report = page.locator("li[data-moment] [data-report]").first();
    const momentId = await report.getAttribute("data-report");
    await chapter.focus();
    await page.keyboard.press("Tab");
    await expect(report).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Add a note (optional, before you choose)")).toBeFocused();
    await page.keyboard.type("The chapter title names the wrong week.");
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("button", { name: "Wrong source" })).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("button", { name: "Misrepresents the shiur" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page).getByRole("status")).toHaveText("Thank you. Your report was sent.");
    expect(stub.bodies).toEqual([
      {
        target: { shiurId: "yi-zmanim-tv-bb-04", momentId, field: "summary" },
        reason: "misrepresents",
        text: "The chapter title names the wrong week.",
        ui: "en",
        rev: expect.any(String),
        turnstile: "e2e-token-1",
        audio: "original",
      },
    ]);
    await expect(dialog(page).getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(report).toBeFocused();
  });

  test("a Turnstile refusal from the server is explained and the next choice goes through", async ({ page }) => {
    const stub = await stubApi(page);
    stub.queue.push(403);
    await openRoom(page, "en");
    await page.locator("main article > header [data-report]").click();
    await dialog(page).getByRole("button", { name: "Something else" }).click();
    await expect(dialog(page).getByRole("alert")).toHaveText(/could not confirm that this report comes from a person/);
    await dialog(page).getByRole("button", { name: "Something else" }).click();
    await expect(dialog(page).getByRole("status")).toHaveText("Thank you. Your report was sent.");
    expect(stub.bodies.map((b) => (b as { turnstile: string }).turnstile)).toEqual(["e2e-token-1", "e2e-token-2"]);
  });

  test("a widget that cannot verify the browser blocks sending and says so", async ({ page }) => {
    const stub = await stubApi(page);
    await page.addInitScript(() => {
      (window as unknown as { __turnstileMode: string }).__turnstileMode = "error";
    });
    await openRoom(page, "en");
    await page.locator("main article > header [data-report]").click();
    await expect(dialog(page).getByRole("alert")).toHaveText(/did not load/);
    await expect(dialog(page).getByRole("button", { name: "Wrong source" })).toBeDisabled();
    expect(stub.bodies).toHaveLength(0);
  });

  test("Yiddish: the dialog is in Yiddish, right to left, and sends ui=yi", async ({ page }) => {
    const stub = await stubApi(page);
    await openRoom(page, "yi");
    await page.locator("main article > header").getByRole("button", { name: "עפעס איז דא נישט ריכטיג" }).click();
    await expect(dialog(page).getByRole("heading")).toHaveText("עפעס איז דא נישט ריכטיג?");
    expect(await dialog(page).getByRole("heading").evaluate((el) => getComputedStyle(el).direction)).toBe("rtl");
    await dialog(page).getByRole("button", { name: "אומריכטיגע צייט" }).click();
    await expect(dialog(page).getByRole("status")).toHaveText("א דאנק. אייער מעלדונג איז געשיקט געווארן.");
    expect(stub.bodies[0]).toMatchObject({ target: { shiurId: "yi-zmanim-tv-bb-04", field: "time" }, reason: "wrong-time", ui: "yi" });
  });

  for (const ui of ["en", "yi"] as const) {
    test(`axe is clean with the dialog open (${ui})`, async ({ page }) => {
      await stubApi(page);
      await openRoom(page, ui);
      await page.locator("main article > header [data-report]").click();
      await expect(dialog(page)).toBeVisible();
      const result = await new AxeBuilder({ page }).include("[data-report-dialog]").analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
    });
  }
});

test.describe("against the staging API", () => {
  test.skip(STAGING === "", "set LIVE_E2E_FEEDBACK_API to the staging host to run");

  test("stores a report (202 with an id)", async ({ page }) => {
    await page.route("**/api/feedback", async (route) => {
      const response = await route.fetch({ url: `${STAGING}/api/feedback` });
      await route.fulfill({ response });
    });
    await openRoom(page, "en");
    const sent = page.waitForResponse((r) => r.url().endsWith("/api/feedback"));
    await page.locator("main article > header [data-report]").click();
    await dialog(page).getByLabel("Add a note (optional, before you choose)").fill("e2e check from the W4.7 spec; please close.");
    await dialog(page).getByRole("button", { name: "Something else" }).click();
    const res = await sent;
    expect(res.status()).toBe(202);
    const body = (await res.json()) as { id?: unknown };
    expect(typeof body.id).toBe("string");
    await expect(dialog(page).getByRole("status")).toHaveText("Thank you. Your report was sent.", { timeout: 30_000 });
    const req: Request = res.request();
    expect(req.postDataJSON()).toMatchObject({ reason: "other", ui: "en", target: { shiurId: "yi-zmanim-tv-bb-04" } });
  });
});
