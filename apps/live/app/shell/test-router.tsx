/**
 * Test helper: builds an in-memory data router from the real `routes.ts` config and the real route
 * modules, so shell tests exercise the same tree the app ships (minus the root `<html>` Layout, which
 * cannot render inside a test container).
 */
import type { RouteConfigEntry } from "@react-router/dev/routes";
import type { ComponentType } from "react";
import { createMemoryRouter, type RouteObject } from "react-router";
import App, { ErrorBoundary } from "../root.tsx";
import routes from "../routes.ts";

interface RouteModule {
  default: ComponentType;
  ErrorBoundary?: ComponentType;
}

const modules = import.meta.glob<RouteModule>(["../routes/*.tsx", "./ui-layout.tsx"], { eager: true });

function moduleFor(file: string): RouteModule {
  const candidates = [`../${file}`, `./${file.replace(/^shell\//, "")}`];
  for (const c of candidates) {
    const m = modules[c];
    if (m) return m;
  }
  throw new Error(`route module not found for ${file}`);
}

function toObject(e: RouteConfigEntry): RouteObject {
  const mod = moduleFor(e.file);
  const base = {
    Component: mod.default,
    ...(mod.ErrorBoundary ? { ErrorBoundary: mod.ErrorBoundary } : {}),
  };
  if (e.index) return { ...base, index: true };
  return {
    ...base,
    ...(e.path !== undefined ? { path: e.path } : {}),
    ...(e.children ? { children: e.children.map(toObject) } : {}),
  };
}

export function createTestRouter(initial: string) {
  return createMemoryRouter(
    [{ id: "root", path: "/", Component: App, ErrorBoundary, children: routes.map(toObject) }],
    { initialEntries: [initial] },
  );
}
