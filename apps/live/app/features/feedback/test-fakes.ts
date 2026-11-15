/**
 * Test doubles for the report feature: a scriptable Turnstile and a recording fetch for
 * `POST /api/feedback`. Imported by tests only.
 */
import type { TurnstileApi, TurnstileRenderOptions } from "./turnstile.ts";

export type TurnstileMode =
  /** Issues a token right after render and after each reset. */
  | "pass"
  /** Calls the error callback (the widget could not verify the browser). */
  | "error"
  /** Waits for `issue()` (a slow or interactive challenge). */
  | "manual";

export class FakeTurnstile implements TurnstileApi {
  mode: TurnstileMode = "pass";
  renders = 0;
  resets = 0;
  removed = 0;
  private serial = 0;
  private widgets = new Map<string, TurnstileRenderOptions>();
  lastOptions: TurnstileRenderOptions | null = null;

  render(_container: HTMLElement, options: TurnstileRenderOptions): string {
    this.renders++;
    const id = `w${this.renders}`;
    this.widgets.set(id, options);
    this.lastOptions = options;
    this.kick(id);
    return id;
  }

  reset(widgetId: string): void {
    this.resets++;
    this.kick(widgetId);
  }

  remove(widgetId: string): void {
    this.removed++;
    this.widgets.delete(widgetId);
  }

  /** Issues a fresh token to every live widget (mode "manual"). */
  issue(): void {
    for (const o of this.widgets.values()) o.callback(this.nextToken());
  }

  /** Fails every live widget. */
  fail(): void {
    for (const o of this.widgets.values()) o["error-callback"]();
  }

  get live(): number {
    return this.widgets.size;
  }

  private nextToken(): string {
    this.serial++;
    return `token-${this.serial}`;
  }

  private kick(id: string): void {
    const o = this.widgets.get(id);
    if (!o) return;
    if (this.mode === "pass") queueMicrotask(() => this.widgets.get(id)?.callback(this.nextToken()));
    else if (this.mode === "error") queueMicrotask(() => this.widgets.get(id)?.["error-callback"]());
  }
}

export interface RecordedRequest {
  url: string;
  method: string;
  body: unknown;
}

/** A fetch that answers `POST /api/feedback` from a queue of responses (default 202). */
export function recordingFetch(): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
  respond(status: number, body: unknown): void;
  failNext(): void;
} {
  const requests: RecordedRequest[] = [];
  const queue: (Response | "fail")[] = [];
  let n = 0;
  return {
    requests,
    respond(status, body) {
      queue.push(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
    },
    failNext() {
      queue.push("fail");
    },
    fetch: async (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? "GET", body: JSON.parse(String(init?.body ?? "null")) });
      const next = queue.shift();
      if (next === "fail") throw new TypeError("Failed to fetch");
      if (next) return next;
      n++;
      return new Response(JSON.stringify({ id: `id-${n}` }), { status: 202, headers: { "content-type": "application/json" } });
    },
  };
}
