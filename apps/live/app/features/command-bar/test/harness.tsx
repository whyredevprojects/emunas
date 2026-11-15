/** Shared setup for the command bar and search page component tests (real route tree, fake fetches). */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { RouterProvider } from "react-router";
import { expect, vi } from "vitest";
import { configureData, resetDataConfig } from "../live-data.ts";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { configureSearchApi, resetSearchApi, type ApiFetch } from "../api.ts";
import { clearQuickSearch } from "../load.ts";
import { dataServer, type DataServer } from "./data.ts";

export interface ApiMock {
  fetch: ApiFetch;
  calls: URL[];
}

/** An API that answers with `respond(url)`; records every call. */
export function apiMock(respond: (url: URL) => Response | Promise<Response>): ApiMock {
  const calls: URL[] = [];
  return {
    calls,
    fetch: async (input) => {
      const url = new URL(input, "http://x.invalid");
      calls.push(url);
      return respond(url);
    },
  };
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let onLineSpy: { mockRestore: () => void } | null = null;

export function setOnline(online: boolean): void {
  onLineSpy?.mockRestore();
  onLineSpy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
}

export function setup(api: ApiMock, data: DataServer = dataServer()): DataServer {
  configureData({ fetch: data.fetch });
  configureSearchApi({ fetch: api.fetch, timeoutMs: 2000 });
  clearQuickSearch();
  settingsStore.getState().reset();
  return data;
}

export function teardown(): void {
  cleanup();
  resetDataConfig();
  resetSearchApi();
  clearQuickSearch();
  onLineSpy?.mockRestore();
  onLineSpy = null;
}

export async function renderAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  return { router, ...utils };
}

export async function noAxeViolations(): Promise<void> {
  const result = await axe.run(document, {
    rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } },
  });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

export async function waitForSelector(root: ParentNode, selector: string): Promise<Element> {
  let el: Element | null = null;
  await waitFor(() => {
    el = root.querySelector(selector);
    expect(el).not.toBeNull();
  });
  return el as unknown as Element;
}

export const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
