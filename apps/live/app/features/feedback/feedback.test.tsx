// @vitest-environment jsdom
/**
 * "Something's wrong here" in a DOM (W4.7): two taps send exactly the Worker's body; a reason picked
 * before Turnstile answers is sent when it does; a Turnstile refusal (widget or server) and the rate
 * limit are worded and recoverable; the controls are reachable and usable by keyboard; both UI
 * languages; axe; and the listening room carries the control on its items.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UI_LANGS, type UiLang } from "@emunas/i18n";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ReportButton, configureFeedback, resetFeedbackConfig } from "./index.ts";
import { feedbackEn, feedbackT, feedbackYi } from "./strings.ts";

const yi = feedbackT("yi");
import { FEEDBACK_CLASSES } from "./styles.ts";
import { FakeTurnstile, recordingFetch } from "./test-fakes.ts";

let turnstile: FakeTurnstile;
let net: ReturnType<typeof recordingFetch>;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  turnstile = new FakeTurnstile();
  net = recordingFetch();
  configureFeedback({ fetch: net.fetch, loadTurnstile: async () => turnstile, siteKey: () => "1x00000000000000000000AA" });
});

afterEach(() => {
  cleanup();
  resetFeedbackConfig();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const TARGET = { shiurId: "yi-zmanim-tv-bb-04", momentId: "yi-zmanim-tv-bb-04~src14", field: "source" as const };

async function mount(ui: UiLang = "en", target: Parameters<typeof ReportButton>[0]["target"] = TARGET) {
  const utils = render(
    <div lang={ui} dir={ui === "yi" ? "rtl" : "ltr"}>
      <button type="button">before</button>
      <ReportButton ui={ui} rev="rev-7" target={target} />
    </div>,
  );
  await settle();
  return utils;
}

async function open(ui: UiLang = "en") {
  fireEvent.click(screen.getByRole("button", { name: feedbackT(ui)("report.open") }));
  await settle();
  return screen.getByRole("dialog");
}

async function choose(dialog: HTMLElement, name: string) {
  fireEvent.click(within(dialog).getByRole("button", { name }));
  await settle();
}

describe("two taps", () => {
  it("sends the exact body and thanks the reader", async () => {
    await mount();
    const dialog = await open();
    expect(within(dialog).getByRole("heading", { name: feedbackEn["report.title"] })).toBeTruthy();
    expect(turnstile.renders).toBe(1);
    expect(turnstile.lastOptions?.appearance).toBe("interaction-only");
    expect(turnstile.lastOptions?.language).toBe("en");
    await choose(dialog, "Wrong source");
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]).toEqual({
      url: "/api/feedback",
      method: "POST",
      body: {
        target: { shiurId: "yi-zmanim-tv-bb-04", momentId: "yi-zmanim-tv-bb-04~src14", field: "source" },
        reason: "wrong-source",
        ui: "en",
        rev: "rev-7",
        turnstile: "token-1",
      },
    });
    expect(within(dialog).getByRole("status").textContent).toBe(feedbackEn["report.sent"]);
    expect(within(dialog).queryByRole("button", { name: "Wrong source" })).toBeNull();
    expect(document.activeElement?.textContent).toBe(feedbackEn["report.close"]);
  });

  it("includes the optional note, trimmed, and the reason's field", async () => {
    await mount();
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText(feedbackEn["report.note"]), { target: { value: "  He says it is the Maharal, not the Ramban.  " } });
    await choose(dialog, "Wrong name");
    expect(net.requests[0]!.body).toMatchObject({
      target: { shiurId: TARGET.shiurId, momentId: TARGET.momentId, field: "person" },
      reason: "wrong-name",
      text: "He says it is the Maharal, not the Ramban.",
    });
  });

  it("reports on the whole shiur when there is no item", async () => {
    await mount("en", { shiurId: "yi-tanya-1-01", momentId: null });
    const dialog = await open();
    await choose(dialog, "Something else");
    expect(net.requests[0]!.body).toEqual({ target: { shiurId: "yi-tanya-1-01" }, reason: "other", ui: "en", rev: "rev-7", turnstile: "token-1" });
  });

  it("sends a reason chosen before Turnstile answers as soon as it does", async () => {
    turnstile.mode = "manual";
    await mount();
    const dialog = await open();
    await choose(dialog, "Wrong time");
    expect(net.requests).toHaveLength(0);
    expect(within(dialog).getByRole("status").textContent).toBe(feedbackEn["report.verifying"]);
    for (const b of within(dialog).getAllByRole("button").filter((x) => x.dataset["reason"])) expect((b as HTMLButtonElement).disabled).toBe(true);
    await act(async () => turnstile.issue());
    await settle();
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]!.body).toMatchObject({ reason: "wrong-time", target: { field: "time" }, turnstile: "token-1" });
  });

  it("removes the widget when the dialog closes", async () => {
    await mount();
    const dialog = await open();
    expect(turnstile.live).toBe(1);
    fireEvent.click(within(dialog).getByRole("button", { name: feedbackEn["report.close"] }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(turnstile.live).toBe(0);
  });

  it("refuses a note over 1000 characters without sending", async () => {
    await mount();
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText(feedbackEn["report.note"]), { target: { value: "x".repeat(1001) } });
    await choose(dialog, "Something else");
    expect(net.requests).toHaveLength(0);
    expect(within(dialog).getByRole("alert").textContent).toBe(feedbackEn["error.invalid"]);
    expect(within(dialog).getByText(/^1,?001 of 1,?000 characters$/)).toBeTruthy();
  });
});

describe("Turnstile failure and other errors", () => {
  it("handles a server-side Turnstile refusal: says so, gets a fresh token, and the next choice goes through", async () => {
    net.respond(403, { error: "turnstile_failed" });
    await mount();
    const dialog = await open();
    await choose(dialog, "Misrepresents the shiur");
    expect(within(dialog).getByRole("alert").textContent).toBe(feedbackEn["error.verify"]);
    expect(turnstile.resets).toBe(1);
    await choose(dialog, "Misrepresents the shiur");
    expect(net.requests).toHaveLength(2);
    expect(net.requests[0]!.body).toMatchObject({ turnstile: "token-1" });
    expect(net.requests[1]!.body).toMatchObject({ turnstile: "token-2", reason: "misrepresents", target: { field: "summary" } });
    expect(within(dialog).getByRole("status").textContent).toBe(feedbackEn["report.sent"]);
  });

  it("handles a widget that cannot verify: reasons disabled, error shown, retry renders a new widget", async () => {
    turnstile.mode = "error";
    await mount();
    const dialog = await open();
    expect(within(dialog).getByRole("alert").textContent).toBe(feedbackEn["error.verifyLoad"]);
    expect((within(dialog).getByRole("button", { name: "Wrong source" }) as HTMLButtonElement).disabled).toBe(true);
    turnstile.mode = "pass";
    fireEvent.click(within(dialog).getByRole("button", { name: feedbackEn["report.retry"] }));
    await settle();
    expect(turnstile.renders).toBe(2);
    expect(within(dialog).getByRole("alert").textContent).toBe("");
    await choose(dialog, "Wrong source");
    expect(net.requests).toHaveLength(1);
  });

  it("handles the Turnstile script failing to load", async () => {
    let loads = 0;
    configureFeedback({
      loadTurnstile: async () => {
        loads++;
        if (loads === 1) throw new Error("blocked");
        return turnstile;
      },
    });
    await mount();
    const dialog = await open();
    expect(within(dialog).getByRole("alert").textContent).toBe(feedbackEn["error.verifyLoad"]);
    fireEvent.click(within(dialog).getByRole("button", { name: feedbackEn["report.retry"] }));
    await settle();
    await choose(dialog, "Wrong time");
    expect(net.requests).toHaveLength(1);
  });

  it("words the rate limit, an outage and a lost connection", async () => {
    net.respond(429, { error: "rate_limited" });
    net.respond(503, { error: "turnstile_unavailable" });
    net.failNext();
    await mount();
    const dialog = await open();
    await choose(dialog, "Wrong source");
    expect(within(dialog).getByRole("alert").textContent).toBe(feedbackEn["error.rate"]);
    await choose(dialog, "Wrong source");
    expect(within(dialog).getByRole("alert").textContent).toBe(feedbackEn["error.unavailable"]);
    await choose(dialog, "Wrong source");
    expect(within(dialog).getByRole("alert").textContent).toBe(feedbackEn["error.network"]);
    expect(net.requests.map((r) => (r.body as { turnstile: string }).turnstile)).toEqual(["token-1", "token-2", "token-3"]);
  });

  it("shows no control where no site key is configured", async () => {
    configureFeedback({ siteKey: () => null });
    await mount();
    expect(screen.queryByRole("button", { name: feedbackEn["report.open"] })).toBeNull();
  });
});

describe("keyboard", () => {
  it("opens with Enter, keeps every control a focusable native control, and Escape returns focus", async () => {
    await mount();
    const trigger = screen.getByRole("button", { name: feedbackEn["report.open"] });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.tabIndex).toBe(0);
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.keyUp(trigger, { key: "Enter" });
    await settle();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    const controls = [...dialog.querySelectorAll<HTMLElement>("button, textarea")];
    expect(controls.length).toBe(1 + 5 + 1); // note, five reasons, close
    for (const c of controls) {
      expect(c.tabIndex).toBe(0);
      expect(["BUTTON", "TEXTAREA"]).toContain(c.tagName);
    }
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    fireEvent.keyUp(document.activeElement!, { key: "Escape" });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe("both UI languages", () => {
  it("renders the Yiddish dialog and sends ui=yi", async () => {
    await mount("yi");
    const dialog = await open("yi");
    expect(within(dialog).getByRole("heading").textContent).toBe(yi("report.title"));
    for (const r of ["wrong-source", "wrong-name", "wrong-time", "misrepresents", "other"] as const) {
      expect(within(dialog).getByRole("button", { name: yi(`reason.${r}`) })).toBeTruthy();
    }
    expect(turnstile.lastOptions?.language).toBe("auto");
    await choose(dialog, yi("reason.wrong-name"));
    expect(net.requests[0]!.body).toMatchObject({ ui: "yi", reason: "wrong-name" });
    expect(within(dialog).getByRole("status").textContent).toBe(yi("report.sent"));
  });

  it("has a Yiddish string for every English key", () => {
    expect(Object.keys(feedbackYi).sort()).toEqual(Object.keys(feedbackEn).sort());
    for (const v of Object.values(feedbackYi)) expect(String(v)).toMatch(/[א-ת]/);
  });

  for (const ui of UI_LANGS) {
    it(`axe finds no violations with the dialog open (${ui})`, async () => {
      await mount(ui);
      await open(ui);
      const result = await axe.run(document.body, {
        rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false }, region: { enabled: false }, "html-has-lang": { enabled: false } },
      });
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
    });
  }
});

describe("stylesheet", () => {
  it("lists exactly the classes defined in the stylesheet", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, "Feedback.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const classes = [...new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]!))].sort();
    expect(classes).toEqual([...FEEDBACK_CLASSES].sort());
  });

  it("uses logical properties only", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, "Feedback.module.css"), "utf8");
    expect(css).not.toMatch(/\b(margin|padding|border)-(left|right|top|bottom)\b|\b(left|right|top|bottom)\s*:|\b(width|height)\s*:|text-align:\s*(left|right)/);
  });
});
